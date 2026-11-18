# tab-color-scheme

Go to [about:config](about:config) in firefox.

Search for: `svg.context-properties.content.enabled`

And set it to `true`.

This change is required for the icon to show correctly based on the theme.

## Privacy

The extension remembers a color scheme per site in local extension storage and never sends it anywhere.

Firefox lets an extension set only one color scheme for all web content, so the scheme of the site in the active tab applies to every open page. A page you have open can therefore see the scheme change when you switch tabs or windows. A page that opens other sites in a window it controls can also use this to find out which sites have a scheme stored.
