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

    function getPaginationText(index, totalPosts) {
        if (index === undefined || totalPosts === undefined) { return "" };
        return `\n🧵${index + 1}/${totalPosts}`;
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


    function findSlicePoint(text, maxChars, currentChunk, maxChunks) {
        // maxAbandonableChars is an arbitrary number of characters that
        // we're willing to sacrifice at the end of a chunk
        // in order to improve readability. This number may
        // need to be tweaked with usage.
        const maxAbandonableChars = 60;
        let charLimit = maxChars;
        if (isPaginationEnabled()){
            charLimit -= getPaginationTextLength(currentChunk, maxChunks);
        }
        console.log(`XXX charLimit: ${charLimit} maxChars: ${maxChars}`);
        if (getTrueTextLength(text) <= charLimit) {
            // the current section of this chunk of the manual chunk
            // is already shorter than the max
            return text.length; // false length for splitting purposes
        }

        let sliceEnd = charLimit;
        // we could do something fancy with regexp to get the last
        // space including tabs and other not newline things
        // but it's just not worth the cost.
        let lastSpace = text.lastIndexOf(" ", sliceEnd);
        // if there are no spaces then the end of the text
        if (lastSpace == -1){lastSpace = text.length;}
        let lastNewLine = text.lastIndexOf("\n", sliceEnd);
        if (lastNewLine == -1){ lastNewLine = lastSpace; }
        let difference = lastSpace - lastNewLine;

        if (difference > 0){


            // backtrack to the last newline or space because we don't want
            // to split in the middle of a word.
            //
            // Apologies to folks writing Chinese and other languages
            // that don't need spaces. I dunno what to do for you.
            if (difference < maxAbandonableChars){
                // it's nicer to break on a newline near the end
                // than a space in the middle of a sentence that's closer
                // to the max characters.

                sliceEnd = lastNewLine;
            }
        } else {
            sliceEnd = lastSpace;
        }
        return sliceEnd;
    }

    function splitText(text) {
        if (text === undefined || text === ""){return [];}

        const unmodifiedCharLimit = getUnmodifiedCharacterLimit();
        // Split the text at manual split points first
        const manualChunks = text.split(/_{3,}\n*|\*{3,}\n*|-{3,}\n*/);
        const naiveChunkCount = getNaiveChunkCount(text) + manualChunks.length;
        let chunks = [];

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
                let slicePoint = findSlicePoint(
                                    manualChunk,
                                    unmodifiedCharLimit,
                                    chunks.length + 1,
                                    naiveChunkCount
                                );

                if (slicePoint == manualChunk.length){
                    chunks.push(manualChunk);
                    break;
                }

                console.log(`XXX slicing at ${slicePoint} out of ${manualChunk.length}`);
                let startChunk = manualChunk.slice(0, slicePoint);
                chunks.push(startChunk);
                // replace the think we're chunking with everything
                // after the chunk we just made.
                manualChunk = manualChunk.slice(slicePoint);

            }
        });

        return chunks;
    }

    function formatChunk(chunk) {
        chunk = chunk.replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank">$1</a>');

        // Replace @username@domain format
        chunk = chunk.replace(/@(\S+)@(\S+)/g, function(match, username, domain) {
            return `<a href="https://${domain}/@${username}" target="_blank">${match}</a>`;
        });

        // Now replace hashtags and simple @username
        chunk = chunk.replace(/#(\w+)/g, '<a href="https://mastodon.social/tags/$1" target="_blank">#$1</a>');

        // Avoid replacing usernames that have already been replaced with their domain.
        // chunk = chunk.replace(/@(?!.*<a href)(\w+)/g, '<a href="https://mastodon.social/@$1" target="_blank">@$1</a>');

        chunk = chunk.replace(/\n/g, '<br>');  // Respect newlines

        return chunk;
    }

    $('#inputText').on('input', debounce(function() {
        const text = $(this).val();
        const chunks = splitText(text) || [];
        const totalPosts = chunks.length;
        const paginationEnabled = isPaginationEnabled();


        $('#previewArea').empty();
        chunks.forEach((chunk, index) => {
            const charCount = chunk.length;
            const formattedChunk = formatChunk(chunk);

            let paginationText = "";
            if (paginationEnabled) {
                paginationText = getPaginationText(index, totalPosts);
            }

            $('#previewArea').append(`
                <div class="post-container">
                    <div class="alert alert-secondary">
                        <button class="btn btn-secondary btn-copy" data-text="${escapeHTML(chunk + paginationText)}">Copy</button>
                        <span class="char-count">${charCount} chars</span>
                        ${formattedChunk}
                        ${paginationText ? `<br><span class="post-number">${paginationText}</span>` : ''}
                    </div>
                </div>
            `);
        });

        var objDiv = document.getElementById("scrollingPreview");
        objDiv.scrollTop = objDiv.scrollHeight;
    }));

    $('#applyLimit').on('click', function() {
        // Trigger the input event to refresh the preview
        $('#inputText').trigger('input');
    });

    $(document).on('click', '.btn-copy', function() {
        const textToCopy = $(this).data('text');
        const textarea = $('<textarea>');
        textarea.text(textToCopy);
        $('body').append(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();

        // Change the button text to "Copied"
        $(this).text('Copied');
        // Reset button text after 2 seconds
        setTimeout(() => {
            $(this).text('Copy');
        }, 2000);

        // Add the copied class to the button to change its color
        $(this).addClass('copied');

        // Add the copied-post class to the parent post-container to change its background
        $(this).closest('.post-container').addClass('copied-post');
    });

$('#inputText').trigger('input');

});
