'use strict';

const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;

var Preferences = GObject.registerClass({
    Signals: {
        'historySizeChanged': {},
        'toggleMenuShortcutChanged': {},
        'webSearchEngineChanged': {},
    },
}, class Preferences extends GObject.Object {
    constructor() {
        super();

        this._keyHistorySize = `history-size`;
        this._keyToggleMenuShortcut = `toggle-menu-shortcut`;
        this._keyWebSearchEngine = `web-search-engine`;
        this._keyCustomWebSearchUrl = `custom-web-search-url`;

        this._settings = ExtensionUtils.getSettings();
        this._settings.connect(`changed::${this._keyHistorySize}`, () => {
            this.emit(`historySizeChanged`);
        });
        this._settings.connect(`changed::${this._keyToggleMenuShortcut}`, () => {
            this.emit(`toggleMenuShortcutChanged`);
        });
        this._settings.connect(`changed::${this._keyWebSearchEngine}`, () => {
            this.emit(`webSearchEngineChanged`);
        });
    }

    get historySize() {
        return this._settings.get_int(this._keyHistorySize);
    }

    get toggleMenuShortcut() {
        return this._settings.get_strv(this._keyToggleMenuShortcut)[0] ?? ``;
    }

    set toggleMenuShortcut(toggleMenuShortcut) {
        this._settings.set_strv(this._keyToggleMenuShortcut, [toggleMenuShortcut]);
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
});
