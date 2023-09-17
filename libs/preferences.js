'use strict';

const { GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

var Preferences = GObject.registerClass({
    Signals: {
        'destroy': {},
        'historySizeChanged': {},
        'webSearchEngineChanged': {},
        'shortcutChanged': {
            param_types: [GObject.TYPE_STRING],
        },
    },
}, class Preferences extends GObject.Object {
    constructor() {
        super();

        this._keyHistorySize = `history-size`;
        this._keyShowSurroundingWhitespace = `show-surrounding-whitespace`;
        this._keyShowColorPreview = `show-color-preview`;
        this._keyWebSearchEngine = `web-search-engine`;
        this._keyCustomWebSearchUrl = `custom-web-search-url`;
        this._keyExpiryDays = `expiry-days`;
        this._keyToggleMenuShortcut = `toggle-menu-shortcut`;
        this._keyTogglePrivateModeShortcut = `toggle-private-mode-shortcut`;
        this._keyClearHistoryShortcut = `clear-history-shortcut`;

        this._settings = ExtensionUtils.getSettings();
        this._settingsChangedId = this._settings.connect(`changed`, (...[, key]) => {
            switch (key) {
                case this._keyHistorySize: {
                    this.emit(`historySizeChanged`);
                    break;
                }
                case this._keyWebSearchEngine: {
                    this.emit(`webSearchEngineChanged`);
                    break;
                }
                case this._keyToggleMenuShortcut:
                case this._keyTogglePrivateModeShortcut:
                case this._keyClearHistoryShortcut: {
                    this.emit(`shortcutChanged`, key);
                    break;
                }
                default:
                    break;
            }
        });
    }

    destroy() {
        this._settings.disconnect(this._settingsChangedId);

        this.emit(`destroy`);
    }

    get historySize() {
        return this._settings.get_int(this._keyHistorySize);
    }

    get webSearchEngine() {
        return this._settings.get_string(this._keyWebSearchEngine);
    }

    set webSearchEngine(webSearchEngine) {
        this._settings.set_string(this._keyWebSearchEngine, webSearchEngine);
    }

    get customWebSearchUrl() {
        return this._settings.get_string(this._keyCustomWebSearchUrl);
    }

    get expiryDays() {
        return this._settings.get_int(this._keyExpiryDays);
    }

    bind(key, object, property, flags) {
        this._settings.bind(key, object, property, flags);
    }

    getShortcut(key) {
        return this._settings.get_strv(key)[0] ?? ``;
    }

    setShortcut(key, shortcut) {
        this._settings.set_strv(key, [shortcut]);
    }
});
