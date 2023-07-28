'use strict';

const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;

var Preferences = GObject.registerClass({
    Signals: {
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
        this._keyWebSearchEngine = `web-search-engine`;
        this._keyCustomWebSearchUrl = `custom-web-search-url`;
        this._keyToggleMenuShortcut = `toggle-menu-shortcut`;
        this._keyTogglePrivateModeShortcut = `toggle-private-mode-shortcut`;
        this._keyClearHistoryShortcut = `clear-history-shortcut`;

        this._settings = ExtensionUtils.getSettings();
        this._settings.connect(`changed::${this._keyHistorySize}`, () => {
            this.emit(`historySizeChanged`);
        });
        this._settings.connect(`changed::${this._keyWebSearchEngine}`, () => {
            this.emit(`webSearchEngineChanged`);
        });
        this._settings.connect(`changed::${this._keyToggleMenuShortcut}`, () => {
            this.emit(`shortcutChanged`, this._keyToggleMenuShortcut);
        });
        this._settings.connect(`changed::${this._keyTogglePrivateModeShortcut}`, () => {
            this.emit(`shortcutChanged`, this._keyTogglePrivateModeShortcut);
        });
        this._settings.connect(`changed::${this._keyClearHistoryShortcut}`, () => {
            this.emit(`shortcutChanged`, this._keyClearHistoryShortcut);
        });
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
