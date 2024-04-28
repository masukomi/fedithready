# FediThready 

An intuitive web tool to seamlessly split and format long texts into manageable chunks for Mastodon threads. 

<img src="https://github.com/masukomi/fedithready/blob/images/images/screenshot_full@2x.png?raw=true" alt=""Screenshot of full interface" width="600">

## Usage
Open it in your browser, start typing. 
Posts will display on the right, and be automatically divided when you reach the character limit. 

You can manually insert a separation between posts by inserting a line with three or more hyphens (`---`), underscores (`___`), or asterisks (`***`)

When you're ready to post, scroll to the top of the preview, click the copy button by the first post, post it, click the copy button by the second post, stick it in a reply to the last post, repeat. As you click copy the post's color will change to let you know you've already grabbed that one.


<img src="https://github.com/masukomi/fedithready/blob/images/images/screenshot_copied_toot@2x.png?raw=true" alt=""Screenshot of copied toot" width="300">

If you're a geek who wants to add in the functionality to let it post automatically I'll happily merge it.

## Installation 
Download a release, or clone the repo, & open the index.html file in your browser. 
That's it. 


## Features

- **Text Splitting**: Automatically divides long texts into Mastodon-friendly chunks. It defaults to 500 characters per toot.
- **Manual Splitting**: Insert 3 hypens, underscores, or asterisks into your text to indicate manual split points.
- **Link, Hashtag, and Username Formatting**: Enhances readability by auto-formatting links, hashtags, and complete usernames.
- **Adjustable Character Limit**: Customize the chunk size as per your preference.
- **Real-time Preview**: Visualize how your text will appear as separate Mastodon posts.
- **Copy to Clipboard**: Quick copy buttons for every chunk, which turn green upon being clicked to indicate a successful copy action.

## Technology Stack

- **HTML/CSS**: Basic building blocks of the web.
- [**Bootstrap**](https://getbootstrap.com/): Open-source CSS framework for responsive design.
- [**jQuery**](https://jquery.com/): Fast, small, and feature-rich JavaScript library.

## Authors 
### Initial prototype
ChatGPT4 - Prompted by [Ralf Stockmann](https://github.com/rstockm)

### Refinement, improvement, & bug fixing
- [masukomi](https://github.com/masukomi/)
- hopefully you
