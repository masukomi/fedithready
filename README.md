# FediThready 

An intuitive web tool to seamlessly split and format long texts into manageable chunks for Mastodon threads. 

FediThready is available for all at [FediThready.app](https://FediThready.app). 

## Privacy
No information is _ever_ transmitted to us. Your login credentials are stored locally on your computer. We don't know what you're posting, or where you're posting it to. We don't share _any_ info with _anyone_. We have none to share.

<img src="https://github.com/masukomi/fedithready/blob/images/images/screenshot_full@2x.png?raw=true" alt="Screenshot of full interface" width="600">

## Usage
Open the HTML file in your browser, start typing. 
Posts will display on the right, and be automatically divided when you reach the character limit. 

You can manually insert a separation between posts by inserting a line with three or more hyphens (`---`), underscores (`___`), or asterisks (`***`)

### Auto-Posting
- Click "Log in to Post"
- Enter the domain name of your mastodon server (ex. `mastodon.social`)
- Finish authenticating
- Click Post Thread to `<your domain>`

You'll remain logged in for future posting, until you click "Disconnect" or your authentication token expires. 

Note: Your login credentials (an oAuth token) are stored locally on your computer. There's no need to click "Disconnect" unless you are on a shared computer or you want to switch which server it's posting to.

### Manual Posting
When you're ready to post, scroll to the top of the preview, click the copy button by the first post, post it, click the copy button by the second post, stick it in a reply to the last post, repeat. As you click copy the post's color will change to let you know you've already grabbed that one.


<img src="https://github.com/masukomi/fedithready/blob/images/images/screenshot_copied_toot@2x.png?raw=true" alt=""Screenshot of copied toot" width="300">


## Local Installation 
Download a release, or clone the repo, & open the index.html file in your browser. 
That's it. 

### Local Authentication Limitations
Posting to a Mastodon server is disabled when loaded via a `file://` URL because of [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing) security measures enforced by Mastodon. FediThready _will_ be able to authenticate and post if you load it from `localhost` or `127.0.0.1`


## Features

- **Text Splitting**: Automatically divides long texts into Mastodon-friendly chunks. It defaults to 500 characters per toot.
- **Manual Splitting**: Insert 3 hypens, underscores, or asterisks into your text to indicate manual split points.
- **Link, Hashtag, and Username Formatting**: Enhances readability by auto-formatting links, hashtags, and complete usernames.
- **Adjustable Character Limit**: Customize the chunk size as per your preference.
- **Real-time Preview**: Visualize how your text will appear as separate Mastodon posts.
- **Copy to Clipboard**: Quick copy buttons for every chunk, which turn green upon being clicked to indicate a successful copy action.

## Future Plans

- Fix [issues](https://github.com/masukomi/fedithready/) as I encounter them. 
- Add accessibility features so that it works well for people with screen readers 
- Merge anything cool that comes via Pull Request. 

This is just about having a simple and useful tool. I'm not trying to build it into anything amazing. I'm happy to merge any useful bug fixes or features. I'm happy to see you fork it and go off in a completely different direction. 

## Technology Stack

- **HTML/CSS**: Basic building blocks of the web.
- [**Bootstrap**](https://getbootstrap.com/): Open-source CSS framework for responsive design.
- [**jQuery**](https://jquery.com/): Fast, small, and feature-rich JavaScript library.

## Authors 
### Initial prototype
ChatGPT4 - Prompted by [Ralf Stockmann](https://github.com/rstockm)

### Refinement, improvement, & bug fixing
- [masukomi](https://github.com/masukomi/)
  Some manually, some via Claude.
- hopefully you
