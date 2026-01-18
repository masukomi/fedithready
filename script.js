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

    // Extract all @username@domain mentions from text
    function extractUsernames(text) {
        const usernameRegex = /@\S+@\S+/g;
        const matches = text.match(usernameRegex);
        if (!matches) return [];
        // Return unique usernames only
        return [...new Set(matches)];
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
                $('#inputText').trigger('input');
            }
        }
    }

    function clear(){
        updateLocalStorage(null);
        $('#inputText').val('');
        $('#inputText').trigger('input');
    }

    /// END OF STANDARD FUNCTIONS

    $('#inputText').on('input', debounce(function() {
        const text = $(this).val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = isPaginationEnabled();
        const usernamePrefix = chunks.usernamePrefix || "";

        updateLocalStorage(text);




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
            const charCount = chunk.text.length;

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

            $('#previewArea').append(`
                <div class="post-container">
                    <div class="alert alert-secondary">
                        <button
                            class="btn btn-secondary btn-copy"
                            data-text="${escapeHTML(copyText + paginationText)}"
                            aria-pressed="false"
                        >${copyButtonText}</button>
                        <span class="char-count">${charCount} characters</span>
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



});
