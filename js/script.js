$(document).ready(function() {
    // Debounce function
    function debounce(func, wait = 500) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    function escapeHTML(text) {
    return text.replace(/&/g, '&amp;')  // First, escape ampersands
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#39;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');
    }

    function isPaginationEnabled() {
        return $('#paginationCheckbox').prop('checked');
    }

    function attemptSentenceEndings() {
        return $('#sentenceEndingsCheckbox').prop('checked');
    }

    function includeUsernamesInReplies() {
        return $('#includeUsernamesCheckbox').prop('checked');
    }

    function getContentWarning() {
        return $('#contentWarning').val().trim();
    }

    // Get the length contribution of content warning to character count
    // Returns 0 if no content warning, otherwise length + 1 (for separation)
    function getContentWarningLength() {
        const cw = getContentWarning();
        if (cw.length === 0) return 0;
        return getTrueTextLength(cw) + 1;
    }

    // Extract all @username@domain mentions from text
    function extractUsernames(text) {
        const usernameRegex = /@\S+@\S+/g;
        const matches = text.match(usernameRegex);
        if (!matches) return [];
        // Return unique usernames only
        return [...new Set(matches)];
    }

    // Validate a post URL (any valid HTTP/HTTPS URL)
    function parsePostUrl(url) {
        if (!url || url.trim() === '') return { valid: true, isEmpty: true };
        url = url.trim();

        // Just validate it's a valid HTTP/HTTPS URL - let the API handle the rest
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return { valid: false, error: 'URL must use http or https' };
            }
            return { valid: true, isEmpty: false, url: url };
        } catch (e) {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    // Cached reply-to data to avoid re-resolving on post
    let cachedReplyTo = null;  // { url, resolvedId, authorAcct, authorDisplayName }

    // Get the username prefix string to prepend to subsequent posts
    function getUsernamePrefix(usernames) {
        if (!usernames || usernames.length === 0) return "";
        return usernames.join(" ") + "\n";
    }

    function getPaginationText(index, totalPosts) {
        if (index === undefined || totalPosts === undefined) { return "" };
        return `\n🧵${index + 1}/${totalPosts}`;
    }

    // Similar to getPaginationText but intended for the copy button.
    // We don't want emojis in this context because it may be read by screen readers.
    function getCopyText(index, totalPosts) {
        if (index === undefined || totalPosts === undefined) { return "" };
        return `Copy chunk ${index + 1} of ${totalPosts}`;

    }


    // naiveChunkCount is a naïve approximation of how many chunks we'll end up with.
    // It will be more than we really get BUT better to overestimate than underestimate.
    // We need this to see how many characters the pagination will take up at the end
    // of each post.
    function getNaiveChunkCount(text){
        if (text === undefined || text.length == 0){ return 0; }
        let unmodifiedCharLimit = getUnmodifiedCharacterLimit();
        // example of what we're doing:
        // "abcd".match(new RegExp(r1, "g")) => Array [ "abc", "d" ]
        let r1 = `.{1,${unmodifiedCharLimit}}`;

        return text.match(new RegExp(r1, "g")).length;
    }

    function getPaginationTextLength(index, totalPosts) {
        if (!isPaginationEnabled()){return 0;}

        return getTrueTextLength(getPaginationText(index, totalPosts));
    }

    function getTrueTextLength(text){
        if (text === undefined || text.length == 0){return 0};
        // Begin the dark magic required to convince JavaScript to count
        // characters instead of codepoints.
        // example: "🧵 1/10".length should be 6 but the emoji makes it 7
        // worse: "👩‍❤️‍💋‍👩".length === 11 because JavaScript's got Load Bearing Bugs
        return [...text].length;
    }
    function getUnmodifiedCharacterLimit() {
        let limit = parseInt($('#charLimit').val(), 10);
        if (isNaN(limit) || limit <= 0) {
            limit = 500;
        }

        return limit;
    }

    function getLastSentenceEnd(text){
        var sentenceEndingsRegexp = new RegExp('(?:[\?\.…!‽\n⁉️‼️❗](?!["\'])\\s?|.{3,}|["\'](?= ))', 'g')
        var lastIdx = null;
        var iterator = text.matchAll(sentenceEndingsRegexp);
        while(x = iterator.next()){
            if (x.value === undefined){break;}
            lastIdx = x.value.index;
        }
        return lastIdx; // may be null

    }

    function findSlicePoint(text, maxChars, currentChunk, maxChunks, usernamePrefixLength) {
        // maxAbandonableChars is an arbitrary number of characters that
        // we're willing to sacrifice at the end of a chunk
        // in order to improve readability. This number may
        // need to be tweaked with usage.
        const maxAbandonableChars = 60;
        // subtract 1 char for the "…" (horizontal elipsis) that may be inserted
        // at the end and 1 more because it may be inserted at the beginning too
        let charLimit = maxChars - 2;
        if (isPaginationEnabled()){
            charLimit -= getPaginationTextLength(currentChunk, maxChunks);
        }
        // Subtract username prefix length for subsequent chunks
        if (usernamePrefixLength && usernamePrefixLength > 0) {
            charLimit -= usernamePrefixLength;
        }
        // Subtract content warning length (+ 1 for separation) if present
        charLimit -= getContentWarningLength();
        if (getTrueTextLength(text) <= charLimit) {
            // the current section of this chunk of the manual chunk
            // is already shorter than the max
            return {"sliceEnd": text.length, "reason": "end"};
        }

        let sliceEnd = charLimit;
        let lastSentenceEnd = attemptSentenceEndings() ? getLastSentenceEnd(text.substring(0,maxChars)) : null;
        if (lastSentenceEnd === null){ lastSentenceEnd = text.length }
        let lastSpace = text.lastIndexOf(" ", sliceEnd);
        if (lastSpace == -1){lastSpace = text.length;}
        // let difference = lastSentenceEnd - lastSpace;
        let difference = lastSpace - lastSentenceEnd;

        if (difference > 0 && difference < maxAbandonableChars){
            return {
                "sliceEnd": lastSentenceEnd,
                "reason": "sentenceEnd"
            }
        }

        return {
            "sliceEnd": lastSpace,
            "reason": "space"
        }
    }

    function splitText(text) {
        if (text === undefined || text === ""){return [];}

        const unmodifiedCharLimit = getUnmodifiedCharacterLimit();
        // Split the text at manual split points first
        const manualChunks = text.split(/_{3,}\n*|\*{3,}\n*|-{3,}\n*/);
        const naiveChunkCount = getNaiveChunkCount(text) + manualChunks.length;
        const shouldIncludeUsernames = includeUsernamesInReplies();

        /* chunks will be an array of objects.
         * each will have sliceEnd, & reason
         * If username inclusion is enabled, also stores usernamePrefix for subsequent chunks
         */
        let chunks = [];
        let usernamePrefixLength = 0;
        let usernamePrefix = "";

        // loop over the manual chunks
        manualChunks.forEach(manualChunk => {
            // remove leading and trailing whitespace in manual chunks
            // we do this because users are likely
            // to put whitespace around dividers
            //     blah blah
            //
            //     ---
            //
            //     blah blah
            manualChunk = manualChunk.trim();
            while (manualChunk.length > 0) { // true length doesn't matter here
                // For chunks after the first, pass the username prefix length
                let prefixLengthForThisChunk = chunks.length > 0 ? usernamePrefixLength : 0;

                let sliceData = findSlicePoint(
                                    manualChunk,
                                    unmodifiedCharLimit,
                                    chunks.length + 1,
                                    naiveChunkCount,
                                    prefixLengthForThisChunk
                                );
                let slicePoint = sliceData["sliceEnd"];

                if (slicePoint == manualChunk.length){
                    chunks.push(Object.assign({}, sliceData, {"reason": "end", "text": manualChunk}));
                    // Extract usernames after first chunk is added
                    if (chunks.length === 1 && shouldIncludeUsernames) {
                        const usernames = extractUsernames(chunks[0].text);
                        usernamePrefix = getUsernamePrefix(usernames);
                        usernamePrefixLength = getTrueTextLength(usernamePrefix);
                    }
                    break;
                }

                let startChunk = manualChunk.slice(0, slicePoint);
                chunks.push(Object.assign({}, sliceData, {"text": startChunk}));

                // Extract usernames after first chunk is added
                if (chunks.length === 1 && shouldIncludeUsernames) {
                    const usernames = extractUsernames(chunks[0].text);
                    usernamePrefix = getUsernamePrefix(usernames);
                    usernamePrefixLength = getTrueTextLength(usernamePrefix);
                }

                // replace the think we're chunking with everything
                // after the chunk we just made.
                manualChunk = manualChunk.slice(slicePoint);

            }
        });

        // Store the username prefix on the result for use in rendering
        if (chunks.length > 0 && shouldIncludeUsernames) {
            chunks.usernamePrefix = usernamePrefix;
        }

        return chunks;
    }

    function formatChunkText(chunkText) {
        chunkText = chunkText.replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank">$1</a>');

        // Replace @username@domain format
        chunkText = chunkText.replace(/@(\S+)@(\S+)/g, function(match, username, domain) {
            return `<a href="https://${domain}/@${username}" target="_blank">${match}</a>`;
        });

        // Now replace hashtags and simple @username
        chunkText = chunkText.replace(/#(\w+)/g, '<a href="https://mastodon.social/tags/$1" target="_blank">#$1</a>');

        // Avoid replacing usernames that have already been replaced with their domain.
        // chunkText = chunkText.replace(/@(?!.*<a href)(\w+)/g, '<a href="https://mastodon.social/@$1" target="_blank">@$1</a>');

        chunkText = chunkText.replace(/\n/g, '<br>');  // Respect newlines

        return chunkText;
    }

    function updateLocalStorage(text) {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem('inputText', text);
        }
    }

    function updateContentWarningLocalStorage(cw) {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem('contentWarning', cw);
        }
    }

    function retrieveContentWarningLocalStorage() {
        if (typeof(Storage) !== "undefined") {
            return localStorage.getItem('contentWarning');
        } else {
            return null;
        }
    }

    function updateReplyToLocalStorage(url) {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem('replyToUrl', url || '');
        }
    }

    function retrieveReplyToLocalStorage() {
        if (typeof(Storage) !== "undefined") {
            return localStorage.getItem('replyToUrl') || '';
        } else {
            return '';
        }
    }

    function retrieveLocalStorage() {
        if (typeof(Storage) !== "undefined") {
            return localStorage.getItem('inputText');
        } else {
            return null;
        }
    }

    function checkForLocalStorageText(){
        // retrieve from localStorage if #inputText is empty
        // this is useful for when the page is refreshed
        if ($('#inputText').val() === "") {
            const text = retrieveLocalStorage();
            if (text !== null) {
                $('#inputText').val(text);
            }
        }
        // Also restore content warning
        if ($('#contentWarning').val() === "") {
            const cw = retrieveContentWarningLocalStorage();
            if (cw !== null) {
                $('#contentWarning').val(cw);
            }
        }
        // Also restore reply-to URL
        if ($('#replyToUrl').val() === "") {
            const replyToUrl = retrieveReplyToLocalStorage();
            if (replyToUrl) {
                $('#replyToUrl').val(replyToUrl);
                // Trigger input to fetch preview (will be handled after login check)
            }
        }
        // Trigger input to update preview
        $('#inputText').trigger('input');
    }

    function clear(){
        updateLocalStorage(null);
        updateContentWarningLocalStorage(null);
        updateReplyToLocalStorage(null);
        $('#inputText').val('');
        $('#contentWarning').val('');
        $('#replyToUrl').val('');
        cachedReplyTo = null;
        $('#replyToPreview').hide();
        updateReplyToStatus('');
        $('#inputText').trigger('input');
    }

    // Update reply-to status message
    function updateReplyToStatus(message, isError) {
        const $status = $('#replyToStatus');
        $status.text(message);
        $status.removeClass('status-error status-info');
        if (message) {
            $status.addClass(isError ? 'status-error' : 'status-info');
        }
    }

    /// END OF STANDARD FUNCTIONS

    $('#inputText, #contentWarning').on('input', debounce(function() {
        const text = $('#inputText').val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = isPaginationEnabled();
        const usernamePrefix = chunks.usernamePrefix || "";
        const contentWarning = getContentWarning();

        updateLocalStorage(text);
        updateContentWarningLocalStorage(contentWarning);

        $('#previewArea').empty();
        // chunks.forEach((chunk, index) => {
        for (let index = 0; index < chunks.length; index++) {
            let chunk = chunks[index]
            /*
               chunk is an object with 3 keys
               sliceEnd: we don't care about that here
               text: the text we need
               reason: this can be sentenceEnd, space, or end
                       "space" indicates that we broke in the middle
                       of a sentence and thus should inert an elipsis.
            */

            if (chunk.reason == "space") {
                chunk.text += "…";
            }
            if (chunks.length > 1 && index > 0 && chunks[index - 1]["reason"] == "space"){
                chunk.text = "…" + chunk.text;
            }

            // Prepend username prefix to subsequent posts (not the first one)
            let displayText = chunk.text;
            let copyText = chunk.text;
            if (index > 0 && usernamePrefix) {
                displayText = usernamePrefix + chunk.text;
                copyText = usernamePrefix + chunk.text;
            }

            const formattedChunk = formatChunkText(displayText);

            let paginationText = "";
            if (paginationEnabled) {
                paginationText = getPaginationText(index, totalPosts);
            }
            let copyButtonText = getCopyText(index, totalPosts);

            // Calculate character count from the full post content
            // Include content warning length + 1 if present
            const cwLength = getContentWarningLength();
            const charCount = getTrueTextLength(copyText + paginationText) + cwLength;

            // Build content warning HTML if present
            const cwHtml = contentWarning ?
                `<div class="content-warning-display">${escapeHTML(contentWarning)}</div>` : '';

            $('#previewArea').append(`
                <div class="post-container">
                    <div class="chunk-text">
                        <button
                            class="btn btn-secondary btn-copy"
                            data-text="${escapeHTML(copyText + paginationText)}"
                            aria-pressed="false"
                        >${copyButtonText}</button>
                        <span class="char-count">${charCount} characters</span>
                        ${cwHtml}
                        ${formattedChunk}
                        ${paginationText ? `<br><span class="post-number">${paginationText}</span>` : ''}
                    </div>
                </div>
            `);
        // });
        }

        var objDiv = document.getElementById("scrollingPreview");
        objDiv.scrollTop = objDiv.scrollHeight;
    }));

    $('#applyLimit').on('click', function() {
        // Trigger the input event to refresh the preview
        $('#inputText').trigger('input');
    });

    $('#includeUsernamesCheckbox').on('change', function() {
        // Trigger the input event to refresh the preview
        $('#inputText').trigger('input');
    });

    $('#visibilitySelect').on('change', function() {
        // Auto-check "Include usernames" when Direct is selected
        if ($(this).val() === 'direct') {
            $('#includeUsernamesCheckbox').prop('checked', true);
            $('#inputText').trigger('input');
        }
    });

    $('#clearText').on('click', function() {
        confirm("Are you sure you want to clear the text?") && clear();
    });

    $(document).on('click', '.btn-copy', function() {
        const textToCopy = $(this).data('text');
        const textarea = $('<textarea>');
        textarea.text(textToCopy);
        $('body').append(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();

        var originalText = $(this).text();
        // Change the button text to "Copied"
        $(this).text('Copied');
        // tell screen-readers that the button has been pressed
        $(this)[0].ariaPressed = true;
        // Reset button text after 2 seconds
        setTimeout(() => {
            $(this).text("Re-" + originalText);
        }, 2000);

        // Add the copied class to the button to change its color
        $(this).addClass('copied');

        // Add the copied-post class to the parent post-container to change its background
        $(this).closest('.post-container').addClass('copied-post');
    });

    checkForLocalStorageText();

    $('#inputText').trigger('input');

    // ============================================
    // Mastodon OAuth and Posting Integration
    // ============================================

    // Update the Mastodon button based on login state
    function updateMastodonButton() {
        const credentials = MastodonAPI.getCredentials();
        if (credentials) {
            $('#mastodonButton').text('Post thread to ' + credentials.instance);
            $('#mastodonButton').removeClass('btn-success').addClass('btn-primary');
            $('#logoutButton').show();
            $('#replyToSection').show();
            // Trigger reply-to URL check if there's a saved URL
            const savedUrl = $('#replyToUrl').val().trim();
            if (savedUrl) {
                $('#replyToUrl').trigger('input');
            }
        } else {
            $('#mastodonButton').text('Log in to post');
            $('#mastodonButton').removeClass('btn-primary').addClass('btn-success');
            $('#logoutButton').hide();
            $('#replyToSection').hide();
        }
        // Enable button (it may have been disabled after posting)
        $('#mastodonButton').prop('disabled', false);
        hidePostStatus();
    }

    // Show post status message
    function showPostStatus(message, isError) {
        $('#postStatus')
            .text(message)
            .removeClass('status-success status-error')
            .addClass(isError ? 'status-error' : 'status-success')
            .show();
    }

    // Hide post status message
    function hidePostStatus() {
        $('#postStatus').hide();
    }

    // Get chunks formatted for posting (with pagination and username prefixes)
    function getChunksForPosting() {
        const text = $('#inputText').val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = isPaginationEnabled();
        const usernamePrefix = chunks.usernamePrefix || "";

        const formattedChunks = [];

        for (let index = 0; index < chunks.length; index++) {
            let chunk = chunks[index];

            // Add ellipsis for mid-sentence breaks
            if (chunk.reason == "space") {
                chunk.text += "…";
            }
            if (chunks.length > 1 && index > 0 && chunks[index - 1]["reason"] == "space") {
                chunk.text = "…" + chunk.text;
            }

            // Build the full text for this chunk
            let fullText = "";

            // Prepend username prefix to subsequent posts (not the first one)
            if (index > 0 && usernamePrefix) {
                fullText += usernamePrefix;
            }

            fullText += chunk.text;

            // Add pagination
            if (paginationEnabled) {
                fullText += getPaginationText(index, totalPosts);
            }

            formattedChunks.push(fullText);
        }

        return formattedChunks;
    }

    // Handle OAuth callback on page load
    async function handleOAuthCallback() {
        try {
            const credentials = await MastodonAPI.handleOAuthCallback();
            if (credentials) {
                updateMastodonButton();
            }
        } catch (error) {
            console.error('OAuth callback error:', error);
            showErrorModal('Login failed: ' + error.message);
        }
    }

    // Post thread to Mastodon
    async function postThreadToMastodon() {
        const credentials = MastodonAPI.getCredentials();
        if (!credentials) {
            showLoginModal();
            return;
        }

        const chunks = getChunksForPosting();
        if (chunks.length === 0) {
            showErrorModal('No text to post');
            return;
        }

        const visibility = $('#visibilitySelect').val();
        const contentWarning = getContentWarning();

        // Validate Direct visibility requirements
        if (visibility === 'direct') {
            const firstChunkUsernames = extractUsernames(chunks[0]);
            const includeUsernames = includeUsernamesInReplies();

            if (firstChunkUsernames.length === 0 || !includeUsernames) {
                showErrorModal('Posts with a Direct visibility must include a username in each post. Please add 1 or more usernames to the first section and check the "Include usernames in replies" checkbox.');
                return;
            }
        }

        // Handle reply-to URL
        const replyToUrl = $('#replyToUrl').val().trim();
        let replyToId = null;

        if (replyToUrl) {
            const parsed = parsePostUrl(replyToUrl);
            if (!parsed.valid) {
                showErrorModal(parsed.error);
                return;
            }
            if (!parsed.isEmpty) {
                // Use cached data if URL matches, otherwise resolve
                if (cachedReplyTo && cachedReplyTo.url === replyToUrl) {
                    replyToId = cachedReplyTo.resolvedId;
                } else {
                    $('#mastodonButton').prop('disabled', true);
                    showPostStatus('Resolving reply-to post...', false);
                    try {
                        const resolved = await MastodonAPI.resolvePostUrl(
                            credentials.instance, credentials.accessToken, replyToUrl
                        );
                        replyToId = resolved.id;
                    } catch (error) {
                        hidePostStatus();
                        showErrorModal('Failed to resolve reply-to post: ' + error.message);
                        $('#mastodonButton').prop('disabled', false);
                        return;
                    }
                }
            }
        }

        // Disable button and show posting status
        $('#mastodonButton').prop('disabled', true);
        showPostStatus('Posting...', false);

        try {
            const result = await MastodonAPI.postThread(
                credentials.instance,
                credentials.accessToken,
                chunks,
                visibility,
                contentWarning,
                replyToId
            );

            if (result.success) {
                showPostStatus('Thread posted successfully!', false);
            } else {
                hidePostStatus();
                showErrorModal('Failed to post item ' + (result.failedIndex + 1) + ': ' + result.error);
            }
        } catch (error) {
            hidePostStatus();
            showErrorModal('Failed to post: ' + error.message);
        }
    }

    // Show error modal
    function showErrorModal(message) {
        $('#errorModalMessage').text(message);
        $('#errorModal').show();
    }

    // Hide error modal
    function hideErrorModal() {
        $('#errorModal').hide();
    }

    // Show login modal
    function showLoginModal() {
        $('#modalError').hide();

        // Check if running from file:// protocol
        if (MastodonAPI.isFileProtocol()) {
            $('#instanceStep').hide();
            $('#fileProtocolError').show();
        } else {
            $('#fileProtocolError').hide();
            $('#instanceStep').show();
            $('#instanceInput').val('');
            $('#authorizeBtn').prop('disabled', false).text('Authorize');
        }

        $('#loginModal').show();
    }

    // Hide login modal
    function hideLoginModal() {
        $('#loginModal').hide();
    }

    // Start authorization
    async function startAuthorization() {
        const instance = $('#instanceInput').val().trim();
        if (!instance) {
            $('#modalError').text('Please enter an instance domain').show();
            return;
        }

        $('#authorizeBtn').prop('disabled', true).text('Connecting...');
        $('#modalError').hide();

        try {
            await MastodonAPI.startOAuthFlow(instance);
            // Page will redirect to Mastodon for authorization
        } catch (error) {
            $('#modalError').text('Error: ' + error.message).show();
            $('#authorizeBtn').prop('disabled', false).text('Authorize');
        }
    }

    // Mastodon button click handler
    $('#mastodonButton').on('click', function() {
        const credentials = MastodonAPI.getCredentials();
        if (credentials) {
            postThreadToMastodon();
        } else {
            showLoginModal();
        }
    });

    // Authorize button click handler
    $('#authorizeBtn').on('click', function() {
        startAuthorization();
    });

    // Enter key in instance input
    $('#instanceInput').on('keypress', function(e) {
        if (e.which === 13) {
            startAuthorization();
        }
    });

    // Logout button click handler
    $('#logoutButton').on('click', function() {
        MastodonAPI.clearCredentials();
        updateMastodonButton();
    });

    // Close modal handlers
    $('.modal-close').on('click', function() {
        hideLoginModal();
        hideErrorModal();
    });

    $('#loginModal').on('click', function(e) {
        if (e.target === this) {
            hideLoginModal();
        }
    });

    $('#errorModal').on('click', function(e) {
        if (e.target === this) {
            hideErrorModal();
        }
    });

    $('#errorModalCloseBtn').on('click', function() {
        hideErrorModal();
    });

    // Re-enable post button when text changes (after posting)
    $('#inputText').on('input', function() {
        if ($('#mastodonButton').prop('disabled')) {
            const credentials = MastodonAPI.getCredentials();
            if (credentials) {
                // Only re-enable if text is cleared or changed
                $('#mastodonButton').prop('disabled', false);
                hidePostStatus();
            }
        }
    });

    // Update clear button to also re-enable post button
    $('#clearText').off('click').on('click', function() {
        if (confirm("Are you sure you want to clear the text?")) {
            clear();
            $('#mastodonButton').prop('disabled', false);
            hidePostStatus();
        }
    });

    // Reply-to URL input handler (debounced)
    $('#replyToUrl').on('input', debounce(async function() {
        const url = $(this).val().trim();
        cachedReplyTo = null;
        updateReplyToLocalStorage(url);

        if (!url) {
            $('#replyToPreview').hide();
            updateReplyToStatus('');
            return;
        }

        const parsed = parsePostUrl(url);
        if (!parsed.valid) {
            updateReplyToStatus(parsed.error, true);
            $('#replyToPreview').hide();
            return;
        }

        const credentials = MastodonAPI.getCredentials();
        if (!credentials) {
            updateReplyToStatus('Log in to preview parent post', false);
            return;
        }

        updateReplyToStatus('Fetching post...', false);
        try {
            const post = await MastodonAPI.resolvePostUrl(
                credentials.instance, credentials.accessToken, url
            );
            cachedReplyTo = {
                url: url,
                resolvedId: post.id,
                authorAcct: '@' + post.account.acct,
                authorDisplayName: post.account.display_name
            };

            // Show preview
            $('#replyToAuthor').text(post.account.display_name + ' (' + cachedReplyTo.authorAcct + ')');
            $('#replyToContent').html(post.content);  // Mastodon returns HTML
            $('#replyToPreview').show();
            updateReplyToStatus('', false);

            // Build list of usernames to prepend to input text
            // 1. Extract mentions from the parent post content (strip HTML first)
            const plainTextContent = post.content.replace(/<[^>]*>/g, ' ');
            const contentMentions = extractUsernames(plainTextContent);
            // 2. Add the author's username
            const authorMention = '@' + post.account.acct;
            const allMentions = [...contentMentions, authorMention];
            // 3. Deduplicate
            const uniqueMentions = [...new Set(allMentions)];
            // 4. Prepend to input text (only those not already present)
            const currentText = $('#inputText').val();
            const missingMentions = uniqueMentions.filter(m => !currentText.includes(m));
            if (missingMentions.length > 0) {
                const prefix = missingMentions.join(' ') + ' ';
                $('#inputText').val(prefix + currentText);
                // 5. Check "Include usernames in replies" so mentions appear in all chunks
                $('#includeUsernamesCheckbox').prop('checked', true);
                $('#inputText').trigger('input');
            }
        } catch (error) {
            updateReplyToStatus('Could not fetch post: ' + error.message, true);
            $('#replyToPreview').hide();
        }
    }, 800));

    // Clear reply-to button handler
    $('#clearReplyTo').on('click', function() {
        $('#replyToUrl').val('');
        cachedReplyTo = null;
        updateReplyToLocalStorage('');
        $('#replyToPreview').hide();
        updateReplyToStatus('');
    });

    // Check for OAuth callback on page load
    handleOAuthCallback();

    // Update button state on page load
    updateMastodonButton();

    // Handle replyToUrl query string parameter
    function handleReplyToUrlQueryParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const queryReplyToUrl = urlParams.get('replyToUrl');

        if (!queryReplyToUrl) return;

        const currentReplyToUrl = $('#replyToUrl').val().trim();

        // If there's already a different URL in the field, show conflict dialog
        if (currentReplyToUrl && currentReplyToUrl !== queryReplyToUrl) {
            pendingQueryReplyToUrl = queryReplyToUrl;
            $('#replyUrlConflictModal').show();
        } else {
            // No conflict - just set the URL and trigger input
            applyReplyToUrl(queryReplyToUrl);
        }

        // Clear the query string from URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Store pending URL when conflict dialog is shown
    let pendingQueryReplyToUrl = null;

    // Apply reply-to URL (expand accordion if needed, set value, trigger input)
    function applyReplyToUrl(url) {
        // Expand the accordion if it's collapsed
        const $collapse = $('#replyToCollapse');
        if (!$collapse.hasClass('show')) {
            $collapse.collapse('show');
        }

        // Set the URL and trigger input to fetch preview
        $('#replyToUrl').val(url);
        $('#replyToUrl').trigger('input');
    }

    // Reply URL conflict modal handlers
    $('#replyUrlKeepTextBtn').on('click', function() {
        $('#replyUrlConflictModal').hide();
        if (pendingQueryReplyToUrl) {
            applyReplyToUrl(pendingQueryReplyToUrl);
            pendingQueryReplyToUrl = null;
        }
    });

    $('#replyUrlClearAllBtn').on('click', function() {
        $('#replyUrlConflictModal').hide();
        if (pendingQueryReplyToUrl) {
            // Clear all text
            $('#inputText').val('');
            $('#contentWarning').val('');
            updateLocalStorage(null);
            updateContentWarningLocalStorage(null);
            cachedReplyTo = null;
            $('#replyToPreview').hide();

            // Apply the new URL
            applyReplyToUrl(pendingQueryReplyToUrl);
            pendingQueryReplyToUrl = null;
        }
    });

    $('#replyUrlCancelBtn').on('click', function() {
        $('#replyUrlConflictModal').hide();
        pendingQueryReplyToUrl = null;
    });

    // Close modal on X click or outside click
    $('#replyUrlConflictModal .modal-close').on('click', function() {
        $('#replyUrlConflictModal').hide();
        pendingQueryReplyToUrl = null;
    });

    $('#replyUrlConflictModal').on('click', function(e) {
        if (e.target === this) {
            $('#replyUrlConflictModal').hide();
            pendingQueryReplyToUrl = null;
        }
    });

    // Check for replyToUrl query param after everything is set up
    handleReplyToUrlQueryParam();

});
