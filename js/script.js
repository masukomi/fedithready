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

    function stripImageIndicators(text) {
        return text.replace(/🖼\[\d+\]/g, '');
    }

    // Find the UTF-16 string index at which effectiveLimit non-indicator chars have been seen.
    // Used by findSlicePoint so image indicators don't count toward the character limit.
    function findSliceEndForEffectiveLimit(text, effectiveLimit) {
        let effective = 0;
        let i = 0;
        while (i < text.length) {
            // Detect 🖼 (U+1F5BC, encoded as surrogate pair D83D DDBC) followed by [digits]
            if (text.codePointAt(i) === 0x1F5BC && i + 2 < text.length && text[i + 2] === '[') {
                let j = i + 3;
                while (j < text.length && text[j] !== ']') j++;
                if (j < text.length) { // found closing ]
                    i = j + 1;
                    continue;
                }
            }
            if (effective >= effectiveLimit) break;
            const code = text.codePointAt(i);
            i += (code > 0xFFFF) ? 2 : 1;
            effective++;
        }
        return i;
    }

    // Returns sorted array of image numbers referenced in a chunk (e.g. [1, 3])
    function getImageNumbersInChunk(text) {
        const matches = text.match(/🖼\[(\d+)\]/g) || [];
        return matches.map(m => parseInt(m.match(/\d+/)[0]));
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
    let cachedReplyTo = null;  // { url, resolvedId, authorAcct, authorDisplayName, quoteApproval }

    // Image attachments: array of {file, altText, objectUrl} (index+1 = indicator number)
    let images = [];

    // Check if quoting is allowed based on quote_approval.current_user
    function isQuotingAllowed(quoteApproval) {
        if (!quoteApproval || !quoteApproval.current_user) return false;
        const status = quoteApproval.current_user;
        return status === 'automatic' || status === 'manual';
    }

    // Update quote checkbox state based on whether there's a valid URL
    function updateQuoteCheckboxState(hasValidUrl) {
        const $checkbox = $('#quotePostCheckbox');
        if (hasValidUrl) {
            $checkbox.prop('disabled', false);
        } else {
            $checkbox.prop('disabled', true).prop('checked', false);
            $('#quotePostWarning').hide();
        }
    }

    // Handle quote checkbox state change
    function handleQuoteCheckboxChange() {
        const isChecked = $('#quotePostCheckbox').prop('checked');
        const $warning = $('#quotePostWarning');
        const replyToUrl = $('#replyToUrl').val().trim();

        // Update the preview label based on checkbox state
        $('#replyToLabel').text(isChecked ? 'Quoting:' : 'Replying to:');

        if (!isChecked || !cachedReplyTo) {
            $warning.hide();
            // Remove QT prefix if it was added
            removeQtPrefix();
            return;
        }

        // Check if quoting is allowed
        if (!isQuotingAllowed(cachedReplyTo.quoteApproval)) {
            // Quoting not allowed - show warning and add QT prefix
            $warning.html('⚠️ Quoting of that post is not allowed. We\'ll link to it instead &amp; clients will show a preview.').show();
            addQtPrefix(replyToUrl);
        } else {
            // Quoting is allowed
            $warning.hide();
            removeQtPrefix();
        }
    }

    // Add QT: prefix to input text
    function addQtPrefix(url) {
        const $input = $('#inputText');
        const currentText = $input.val();
        const qtPrefix = 'QT: ' + url + '\n\n';

        // Don't add if already present
        if (!currentText.startsWith(qtPrefix)) {
            // Remove any existing QT prefix first (in case URL changed)
            const cleanText = removeQtPrefixFromText(currentText);
            $input.val(qtPrefix + cleanText);
            $input.trigger('input');
        }
    }

    // Remove QT: prefix from input text
    function removeQtPrefix() {
        const $input = $('#inputText');
        const currentText = $input.val();
        const cleanText = removeQtPrefixFromText(currentText);

        if (cleanText !== currentText) {
            $input.val(cleanText);
            $input.trigger('input');
        }
    }

    // Helper to remove QT prefix from text string
    function removeQtPrefixFromText(text) {
        // Match QT: followed by a URL and optional newlines
        return text.replace(/^QT: https?:\/\/\S+\n*/, '');
    }

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
        if (getTrueTextLength(stripImageIndicators(text)) <= charLimit) {
            // the current section of this chunk of the manual chunk
            // is already shorter than the max
            return {"sliceEnd": text.length, "reason": "end"};
        }

        let sliceEnd = findSliceEndForEffectiveLimit(text, charLimit);
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

    function updateCharLimitLocalStorage(limit) {
        if (typeof(Storage) !== "undefined") {
            localStorage.setItem('charLimit', limit);
        }
    }

    function retrieveCharLimitLocalStorage() {
        if (typeof(Storage) !== "undefined") {
            return localStorage.getItem('charLimit');
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

    // Save the user's current visibility before auto-changing it for a reply.
    // Only saves if there isn't already a saved value (to preserve the original
    // choice when the reply-to URL changes multiple times).
    function savePreReplyVisibility(visibility) {
        if (typeof(Storage) !== "undefined" && !localStorage.getItem('preReplyVisibility')) {
            localStorage.setItem('preReplyVisibility', visibility);
        }
    }

    // Retrieve and remove the saved pre-reply visibility.
    function restorePreReplyVisibility() {
        if (typeof(Storage) !== "undefined") {
            const saved = localStorage.getItem('preReplyVisibility');
            localStorage.removeItem('preReplyVisibility');
            return saved;
        }
        return null;
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
        // Restore character limit
        const savedCharLimit = retrieveCharLimitLocalStorage();
        if (savedCharLimit !== null) {
            $('#charLimit').val(savedCharLimit);
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
        // Reset quote checkbox
        $('#quotePostCheckbox').prop('checked', false).prop('disabled', true);
        $('#quotePostWarning').hide();
        $('#visibilitySelect').val('public')
        clearImages();
        $('#inputText').trigger('input');
    }

    function clearImages() {
        images.forEach(img => { if (img) URL.revokeObjectURL(img.objectUrl); });
        images = [];
        $('#imageReferences').empty().hide();
    }

    function rebuildImageReferencesList() {
        const $list = $('#imageReferences');
        $list.empty();
        images.forEach((img, idx) => {
            if (!img) return;
            const num = idx + 1;
            const altEsc = escapeHTML(img.altText || '');
            const $li = $(`
                <li data-image-num="${num}">
                    <div class="image-ref-row">
                        <img class="image-ref-thumb" src="${img.objectUrl}" alt="Image ${num}">
                        <textarea class="form-control image-ref-alt"
                                  rows="1"
                                  placeholder="Alt Text…"
                                  data-image-num="${num}">${altEsc}</textarea>
                        <button class="image-ref-remove" data-image-num="${num}" aria-label="Remove image ${num}">✕</button>
                    </div>
                </li>
            `);
            $list.append($li);
        });
        if (images.length > 0) {
            $list.show();
        } else {
            $list.hide();
        }
    }

    function addImage(file) {
        const objectUrl = URL.createObjectURL(file);
        images.push({ file, altText: '', objectUrl });
        const num = images.length;
        const indicator = `🖼[${num}]`;

        const $textarea = $('#inputText');
        const textarea = $textarea[0];
        if (document.activeElement === textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            textarea.value = before + indicator + after;
            const newPos = start + indicator.length;
            textarea.selectionStart = textarea.selectionEnd = newPos;
        } else {
            const current = textarea.value;
            if (current.length > 0 && !current.endsWith('\n')) {
                textarea.value = current + '\n' + indicator;
            } else {
                textarea.value = current + indicator;
            }
        }

        const altEsc = escapeHTML('');
        const $li = $(`
            <li data-image-num="${num}">
                <div class="image-ref-row">
                    <img class="image-ref-thumb" src="${objectUrl}" alt="Image ${num}">
                    <textarea class="form-control image-ref-alt"
                              rows="1"
                              placeholder="Alt Text…"
                              data-image-num="${num}">${altEsc}</textarea>
                    <button class="image-ref-remove" data-image-num="${num}" aria-label="Remove image ${num}">✕</button>
                </div>
            </li>
        `);
        $('#imageReferences').append($li).show();
        $textarea.trigger('input');
    }

    function removeImage(num) {
        const idx = num - 1;
        const img = images[idx];
        if (!img) return;

        URL.revokeObjectURL(img.objectUrl);
        images.splice(idx, 1);

        // Remove this indicator and renumber subsequent ones
        const $textarea = $('#inputText');
        let text = $textarea.val();
        text = text.replace(new RegExp('\\n?🖼\\[' + num + '\\]', 'g'), '');
        for (let i = idx; i < images.length; i++) {
            const oldNum = i + 2;
            const newNum = i + 1;
            text = text.replace(new RegExp('🖼\\[' + oldNum + '\\]', 'g'), `🖼[${newNum}]`);
        }
        $textarea.val(text);

        rebuildImageReferencesList();
        $textarea.trigger('input');
    }

    // Alt text live update
    $(document).on('input', '.image-ref-alt', function() {
        const num = parseInt($(this).data('image-num'));
        const img = images[num - 1];
        if (img) img.altText = $(this).val();
    });

    // Remove image button
    $(document).on('click', '.image-ref-remove', function() {
        removeImage(parseInt($(this).data('image-num')));
    });

    // Drag-and-drop image handling
    document.addEventListener('dragover', function(e) {
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    document.addEventListener('drop', function(e) {
        const files = e.dataTransfer ? [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')) : [];
        if (files.length === 0) return;
        e.preventDefault();
        files.forEach(file => addImage(file));
    });

    $('#inputText').on('dragover', function(e) {
        if (e.originalEvent.dataTransfer && e.originalEvent.dataTransfer.types.includes('Files')) {
            $(this).addClass('drag-over');
        }
    });

    $('#inputText').on('dragleave drop', function() {
        $(this).removeClass('drag-over');
    });

    // Update reply-to status message
    function updateReplyToStatus(message, isError) {
        const $status = $('#replyToStatus');
        $status.text(message);
        $status.removeClass('status-error status-info');
        if (message) {
            $status.addClass(isError ? 'status-error' : 'status-info');
        }
    }

    // Mirror-div technique: returns pixel coordinates of a caret position within a textarea
    function getCaretCoordinates(element, position) {
        const div = document.createElement('div');
        const style = div.style;
        const computed = window.getComputedStyle(element);

        style.whiteSpace = 'pre-wrap';
        style.wordWrap = 'break-word';
        style.position = 'absolute';
        style.visibility = 'hidden';
        style.top = '0';
        style.left = '0';

        const properties = [
            'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
            'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
            'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
            'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize'
        ];

        properties.forEach(function(prop) {
            style[prop] = computed[prop];
        });

        div.textContent = element.value.substring(0, position);
        const span = document.createElement('span');
        span.textContent = element.value.substring(position) || '.';
        div.appendChild(span);
        document.body.appendChild(div);

        const coordinates = {
            top: span.offsetTop + parseInt(computed.borderTopWidth),
            left: span.offsetLeft + parseInt(computed.borderLeftWidth)
        };

        document.body.removeChild(div);
        return coordinates;
    }

    // Returns the active @mention being typed at the caret, or null if none
    function getActiveMention(textarea) {
        const text = textarea.value;
        const caret = textarea.selectionStart;
        const beforeCaret = text.slice(0, caret);
        const match = beforeCaret.match(/@([^\s@]*)$/);
        if (!match || match[1].length === 0) return null;
        return {
            query: match[1],
            startIndex: caret - match[0].length,
            endIndex: caret
        };
    }

    // Insert a completed @mention into the textarea and trigger a preview update
    function insertMention(textarea, mention, acct) {
        const text = textarea.value;
        const insertion = '@' + acct + ' ';
        const newText = text.slice(0, mention.startIndex) + insertion + text.slice(mention.endIndex);
        textarea.value = newText;
        const newCaret = mention.startIndex + insertion.length;
        textarea.selectionStart = textarea.selectionEnd = newCaret;
        $(textarea).trigger('input');
    }

    /// END OF STANDARD FUNCTIONS

    $('#charLimit').on('input', function() {
        updateCharLimitLocalStorage($(this).val());
        $('#inputText').trigger('input');
    });

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

            // Collect image numbers before stripping indicators
            const chunkImageNums = getImageNumbersInChunk(chunk.text);

            // Strip image indicators from display and copy text
            let displayText = stripImageIndicators(chunk.text);
            let copyText = stripImageIndicators(chunk.text);
            if (index > 0 && usernamePrefix) {
                displayText = usernamePrefix + displayText;
                copyText = usernamePrefix + copyText;
            }

            const formattedChunk = formatChunkText(displayText);

            let paginationText = "";
            if (paginationEnabled) {
                paginationText = getPaginationText(index, totalPosts);
            }
            let copyButtonText = getCopyText(index, totalPosts);

            // Calculate character count (indicators already stripped from copyText)
            const cwLength = getContentWarningLength();
            const charCount = getTrueTextLength(copyText + paginationText) + cwLength;

            // Build content warning HTML if present
            const cwHtml = contentWarning ?
                `<div class="content-warning-display">${escapeHTML(contentWarning)}</div>` : '';

            // Build image thumbnails HTML for this chunk
            let imagesHtml = '';
            if (chunkImageNums.length > 0) {
                const thumbsHtml = chunkImageNums.map(n => {
                    const img = images[n - 1];
                    if (!img) return '';
                    const altEsc = escapeHTML(img.altText || '');
                    return `<img class="chunk-image-thumb" src="${img.objectUrl}" alt="${altEsc}" title="${altEsc || 'Image ' + n}">`;
                }).join('');
                const invalidNums = chunkImageNums.filter(n => !images[n - 1]);
                const invalidErrorHtml = invalidNums.map(n =>
                    `<div class="chunk-images-error">⚠️ 🖼[${n}] doesn't reference a known image.</div>`
                ).join('');
                const tooManyErrorHtml = chunkImageNums.length > 4
                    ? `<div class="chunk-images-error">⚠️ Mastodon doesn't support more than 4 media attachments per post. This chunk has ${chunkImageNums.length} images.</div>`
                    : '';
                imagesHtml = `<div class="chunk-images">${thumbsHtml}${invalidErrorHtml}${tooManyErrorHtml}</div>`;
            }

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
                        ${(paginationText && totalPosts > 1) ? formattedChunk.replace(/(<br\s*\/?>)+$/, '') : formattedChunk}
                        ${(paginationText && totalPosts > 1) ? `<br><span class="post-number">${paginationText}</span>` : ''}
                    </div>
                    ${imagesHtml}
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
        savePreReplyVisibility($('#visibilitySelect').val())

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

    // Get chunks and media formatted for posting (with pagination and username prefixes)
    // Returns { chunks: string[], mediaPerChunk: {file, altText}[][] }
    function getChunksForPosting() {
        const text = $('#inputText').val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = isPaginationEnabled();
        const usernamePrefix = chunks.usernamePrefix || "";

        const formattedChunks = [];
        const mediaPerChunk = [];

        for (let index = 0; index < chunks.length; index++) {
            let chunk = chunks[index];

            // Add ellipsis for mid-sentence breaks
            if (chunk.reason == "space") {
                chunk.text += "…";
            }
            if (chunks.length > 1 && index > 0 && chunks[index - 1]["reason"] == "space") {
                chunk.text = "…" + chunk.text;
            }

            // Collect images for this chunk before stripping indicators
            const imageNums = getImageNumbersInChunk(chunk.text);
            const chunkMedia = imageNums
                .map(n => images[n - 1])
                .filter(img => img !== null && img !== undefined);
            mediaPerChunk.push(chunkMedia);

            // Build the full text for this chunk (strip image indicators)
            let fullText = "";

            if (index > 0 && usernamePrefix) {
                fullText += usernamePrefix;
            }

            fullText += stripImageIndicators(chunk.text);

            if (paginationEnabled && totalPosts > 1) {
                fullText += getPaginationText(index, totalPosts);
            }

            formattedChunks.push(fullText);
        }

        return { chunks: formattedChunks, mediaPerChunk };
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

        const { chunks, mediaPerChunk } = getChunksForPosting();
        if (chunks.length === 0) {
            showErrorModal('No text to post');
            return;
        }

        // Validate image references and attachment limits
        const rawText = $('#inputText').val();
        const allIndicatedNums = getImageNumbersInChunk(rawText);
        const invalidRefs = allIndicatedNums.filter(n => !images[n - 1]);
        if (invalidRefs.length > 0) {
            const list = invalidRefs.map(n => `🖼[${n}]`).join(', ');
            showErrorModal(`The following image references don't correspond to any attached image: ${list}. Please remove them or drag in the missing images.`);
            return;
        }
        for (let i = 0; i < mediaPerChunk.length; i++) {
            if (mediaPerChunk[i].length > 4) {
                showErrorModal(`Post ${i + 1} has ${mediaPerChunk[i].length} images attached. Mastodon doesn't support more than 4 media attachments per post.`);
                return;
            }
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

        // Handle reply-to URL and quote post
        const replyToUrl = $('#replyToUrl').val().trim();
        let replyToId = null;
        let quotedStatusId = null;
        const isQuotePost = $('#quotePostCheckbox').prop('checked');

        if (replyToUrl) {
            const parsed = parsePostUrl(replyToUrl);
            if (!parsed.valid) {
                showErrorModal(parsed.error);
                return;
            }
            if (!parsed.isEmpty) {
                // Use cached data if URL matches, otherwise resolve
                let resolvedPost = null;
                if (cachedReplyTo && cachedReplyTo.url === replyToUrl) {
                    resolvedPost = cachedReplyTo;
                } else {
                    $('#mastodonButton').prop('disabled', true);
                    showPostStatus('Resolving reply-to post...', false);
                    try {
                        const resolved = await MastodonAPI.resolvePostUrl(
                            credentials.instance, credentials.accessToken, replyToUrl
                        );
                        resolvedPost = {
                            resolvedId: resolved.id,
                            quoteApproval: resolved.quote_approval || null
                        };
                    } catch (error) {
                        hidePostStatus();
                        showErrorModal('Failed to resolve reply-to post: ' + error.message);
                        $('#mastodonButton').prop('disabled', false);
                        return;
                    }
                }

                // Determine if this is a quote post or a reply
                if (isQuotePost && isQuotingAllowed(resolvedPost.quoteApproval)) {
                    // Use quoted_status_id for quote posts (when allowed)
                    quotedStatusId = resolvedPost.resolvedId;
                } else {
                    // Use in_reply_to_id for regular replies
                    // (also used when quote is requested but not allowed - QT prefix handles the link)
                    replyToId = resolvedPost.resolvedId;
                }
            }
        }

        // Disable button and upload any media attachments
        $('#mastodonButton').prop('disabled', true);

        const resolvedMediaPerChunk = [];
        const hasMedia = mediaPerChunk.some(m => m.length > 0);
        if (hasMedia) {
            showPostStatus('Uploading images...', false);
        }
        try {
            for (let i = 0; i < mediaPerChunk.length; i++) {
                const chunkMedia = mediaPerChunk[i];
                if (chunkMedia.length > 0) {
                    showPostStatus(`Uploading images for post ${i + 1} of ${chunks.length}...`, false);
                    const mediaIds = [];
                    for (const media of chunkMedia) {
                        const attachment = await MastodonAPI.uploadMedia(
                            credentials.instance, credentials.accessToken,
                            media.file, media.altText || ''
                        );
                        mediaIds.push(attachment.id);
                    }
                    resolvedMediaPerChunk.push(mediaIds);
                } else {
                    resolvedMediaPerChunk.push([]);
                }
            }
        } catch (error) {
            hidePostStatus();
            showErrorModal('Failed to upload image: ' + error.message);
            $('#mastodonButton').prop('disabled', false);
            return;
        }

        showPostStatus('Posting...', false);

        try {
            const result = await MastodonAPI.postThread(
                credentials.instance,
                credentials.accessToken,
                chunks,
                visibility,
                contentWarning,
                replyToId,
                quotedStatusId,
                resolvedMediaPerChunk
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

        // Reset quote checkbox state when URL changes
        $('#quotePostCheckbox').prop('checked', false);
        $('#quotePostWarning').hide();

        if (!url) {
            $('#replyToPreview').hide();
            updateReplyToStatus('');
            updateQuoteCheckboxState(false);
            return;
        }

        const parsed = parsePostUrl(url);
        if (!parsed.valid) {
            updateReplyToStatus(parsed.error, true);
            $('#replyToPreview').hide();
            updateQuoteCheckboxState(false);
            return;
        }

        const credentials = MastodonAPI.getCredentials();
        if (!credentials) {
            updateReplyToStatus('Log in to preview parent post', false);
            updateQuoteCheckboxState(false);
            return;
        }

        updateReplyToStatus('Fetching post...', false);
        try {
            const post = await MastodonAPI.resolvePostUrl(
                credentials.instance, credentials.accessToken, url
            );
            // Build full acct with instance domain (Mastodon omits domain for local users)
            const fullAcct = post.account.acct.includes('@')
                ? post.account.acct
                : post.account.acct + '@' + credentials.instance;

            cachedReplyTo = {
                url: url,
                resolvedId: post.id,
                authorAcct: '@' + fullAcct,
                authorDisplayName: post.account.display_name,
                quoteApproval: post.quote_approval || null
            };

            // Show preview
            $('#replyToAuthor').text(post.account.display_name + ' (' + cachedReplyTo.authorAcct + ')');
            if (post.spoiler_text) {
                $('#replyToCW').text(post.spoiler_text).show();
            } else {
                $('#replyToCW').hide();
            }
            $('#replyToContent').html(post.content);  // Mastodon returns HTML

            // Show attached images in a carousel
            const images = (post.media_attachments || []).filter(a => a.type === 'image');
            const $carouselInner = $('#replyToCarouselInner');
            $carouselInner.empty();
            if (images.length > 0) {
                images.forEach(function(img, i) {
                    const activeClass = i === 0 ? ' active' : '';
                    const alt = img.description ? img.description : '';
                    $carouselInner.append(
                        '<div class="carousel-item' + activeClass + '">' +
                            '<img src="' + img.preview_url + '" class="d-block w-100" alt="' + $('<span>').text(alt).html() + '">' +
                        '</div>'
                    );
                });
                $('#replyToCarousel').show();
            } else {
                $('#replyToCarousel').hide();
            }

            $('#replyToPreview').show();
            updateReplyToStatus('', false);

            // Enable quote checkbox now that we have a valid resolved post
            updateQuoteCheckboxState(true);

            // Match visibility to the parent post
            // NOTE: "private" is intentionally excluded.
            // If the thing you're replying to is followers only,
            // AND your reply is followers only, then the only people
            // who'll be able to see the whole thread are people
            // who follow them and you.
            const recognizedVisibilities = ['public', 'unlisted', 'direct'];
            if (post.visibility && recognizedVisibilities.includes(post.visibility)) {
                savePreReplyVisibility($('#visibilitySelect').val());
                $('#visibilitySelect').val(post.visibility).trigger('change');
            }

            // Inherit content warning from the parent post if ours is empty
            if (post.spoiler_text && $('#contentWarning').val().trim() === '') {
                $('#contentWarning').val(post.spoiler_text);
                $('#contentWarning').trigger('input');
            }

            // Build list of usernames to prepend to input text
            // 1. Extract mentions from the parent post content (strip HTML first)
            const plainTextContent = post.content.replace(/<[^>]*>/g, ' ');
            const contentMentions = extractUsernames(plainTextContent);
            // 2. Add the author's username (with full domain)
            const authorMention = '@' + fullAcct;
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
            updateQuoteCheckboxState(false);
        }
    }, 800));

    // Quote checkbox change handler
    $('#quotePostCheckbox').on('change', function() {
        handleQuoteCheckboxChange();
    });

    // Clear reply-to button handler
    $('#clearReplyTo').on('click', function() {
        $('#replyToUrl').val('');
        cachedReplyTo = null;
        updateReplyToLocalStorage('');
        $('#replyToPreview').hide();
        updateReplyToStatus('');
        // Reset quote checkbox
        $('#quotePostCheckbox').prop('checked', false).prop('disabled', true);
        $('#quotePostWarning').hide();
        removeQtPrefix();
        // Restore visibility to what it was before replying
        const savedVisibility = restorePreReplyVisibility();
        if (savedVisibility) {
            $('#visibilitySelect').val(savedVisibility);
        }
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

    // ============================================
    // Mention Autocomplete
    // ============================================

    const $mentionDropdown = $('<ul id="mentionAutocomplete" class="mention-autocomplete-dropdown"></ul>').hide();
    $('body').append($mentionDropdown);

    // Tracks the mention that was active when the search was fired
    let activeMentionForAutocomplete = null;

    const debouncedMentionSearch = debounce(async function() {
        const credentials = MastodonAPI.getCredentials();
        if (!credentials) return;

        const textarea = document.getElementById('inputText');
        const mention = getActiveMention(textarea);

        if (!mention) {
            $mentionDropdown.hide();
            activeMentionForAutocomplete = null;
            return;
        }

        let accounts;
        try {
            accounts = await MastodonAPI.searchAccounts(credentials.instance, credentials.accessToken, mention.query, 5);
        } catch (e) {
            $mentionDropdown.hide();
            return;
        }

        if (!accounts || accounts.length === 0) {
            $mentionDropdown.hide();
            return;
        }

        // Re-check that the mention is still active (user may have typed more since the request)
        const currentMention = getActiveMention(textarea);
        if (!currentMention || currentMention.startIndex !== mention.startIndex) {
            $mentionDropdown.hide();
            return;
        }

        activeMentionForAutocomplete = currentMention;

        $mentionDropdown.empty();
        accounts.forEach(function(account) {
            const displayName = account.display_name || account.acct;
            const handle = '@' + account.acct;
            const $li = $('<li></li>');
            const $img = $('<img>').attr('src', account.avatar).attr('alt', '');
            const $name = $('<span class="acct-name"></span>').text(displayName);
            const $handle = $('<span class="acct-handle"></span>').text(handle);
            $li.append($img).append($name).append($handle);
            $li.on('click', function() {
                insertMention(textarea, activeMentionForAutocomplete, account.acct);
                $mentionDropdown.hide();
                activeMentionForAutocomplete = null;
                textarea.focus();
            });
            $mentionDropdown.append($li);
        });

        // Position the dropdown at the caret using fixed coordinates
        const textareaRect = textarea.getBoundingClientRect();
        const caretCoords = getCaretCoordinates(textarea, activeMentionForAutocomplete.startIndex);
        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.4 || 20;
        const dropdownTop = textareaRect.top + caretCoords.top - textarea.scrollTop + lineHeight;
        const dropdownLeft = textareaRect.left + caretCoords.left;
        $mentionDropdown.css({ top: dropdownTop + 'px', left: dropdownLeft + 'px' }).show();
    }, 200);

    // Trigger autocomplete search on keyup (skip navigation/modifier keys)
    $('#inputText').on('keyup', function(e) {
        const ignoredKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                             'Enter', 'Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta'];
        if (ignoredKeys.includes(e.key)) return;
        debouncedMentionSearch();
    });

    // Keyboard navigation within the dropdown
    $('#inputText').on('keydown', function(e) {
        if (!$mentionDropdown.is(':visible')) return;

        const $items = $mentionDropdown.find('li');
        const $active = $mentionDropdown.find('li.active');
        const activeIndex = $items.index($active);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            $items.removeClass('active');
            $items.eq(activeIndex < $items.length - 1 ? activeIndex + 1 : 0).addClass('active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            $items.removeClass('active');
            $items.eq(activeIndex > 0 ? activeIndex - 1 : $items.length - 1).addClass('active');
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            const $selected = $mentionDropdown.find('li.active');
            if ($selected.length && activeMentionForAutocomplete) {
                e.preventDefault();
                $selected.trigger('click');
            } else {
                $mentionDropdown.hide();
            }
        } else if (e.key === 'Escape') {
            $mentionDropdown.hide();
            activeMentionForAutocomplete = null;
        }
    });

    // Close dropdown when clicking outside the textarea or dropdown
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#mentionAutocomplete, #inputText').length) {
            $mentionDropdown.hide();
        }
    });

});
