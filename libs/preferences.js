'use strict';

const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;

var Preferences = GObject.registerClass({
    Signals: {
        'historySizeChanged': {},
        'toggleMenuShortcutChanged': {},
    },
}, class Preferences extends GObject.Object {
    _init() {
        super._init();

        this._keyHistorySize = `history-size`;
        this._keyToggleMenuShortcut = `toggle-menu-shortcut`;
        this._keyWebSearchUrl = `web-search-url`;

        this._settings = ExtensionUtils.getSettings();
        this._settings.connect(`changed::${this._keyHistorySize}`, () => {
            this.emit(`historySizeChanged`);
        });
        this._settings.connect(`changed::${this._keyToggleMenuShortcut}`, () => {
            this.emit(`toggleMenuShortcutChanged`);
        });
    }

    get historySize() {
        return this._settings.get_int(this._keyHistorySize);
    }

    get webSearchUrl() {
        return this._settings.get_string(this._keyWebSearchUrl);
    }

    get toggleMenuShortcut() {
        return this._settings.get_strv(this._keyToggleMenuShortcut)[0] ?? ``;
    }

    set toggleMenuShortcut(toggleMenuShortcut) {
        this._settings.set_strv(this._keyToggleMenuShortcut, [toggleMenuShortcut]);
    }

    bind(key, object, property, flags) {
        this._settings.bind(key, object, property, flags);
    }
});
