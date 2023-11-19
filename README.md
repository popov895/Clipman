# Clipman

The main goal of developing the Clipman was to create a simple clipboard manager extension for GNOME that isn't overloaded with features and settings. Unfortunately, the current analogues of this type of extensions have redundant functionality, while not providing the functionality I need.

| Shortcut          | Action                                                |
| ----------------- |------------------------------------------------------ |
| `Space` / `Enter` | Activate the selected entry                           |
| `*`               | Pin/unpin the selected entry                          |
| `Delete`          | Delete the selected entry                             |
| `UpArrow`         | Select the entry above                                |
| `DownArrow`       | Select the entry below                                |
| `RightArrow`      | Open the actions submenu                              |
| `LeftArrow`       | Close the actions submenu                             |
| `/`               | Move keyboard focus to the search field               |
| `Escape`          | Clear the search field (if focused) or close the menu |

### Installation

To install manually follow the steps below:

- download the latest version of the extension from the [releases page](https://github.com/popov895/Clipman/releases)
- run the following command:

   `$ gnome-extensions install clipman@popov895.ukr.net.zip`

- restart your session (logout and login)
- run the following command:

   `$ gnome-extensions enable clipman@popov895.ukr.net`

This extension uses the following libraries:

- [QR Code generator library](https://github.com/nayuki/QR-Code-generator)
- [validator.js](https://github.com/validatorjs/validator.js/)

This extension uses [dpaste.com](https://dpaste.com) to share text online.

### Support

[![Support via Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-1.svg)](https://www.buymeacoffee.com/popov895a)
