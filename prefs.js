'use strict';

const { Adw, Gdk, Gio, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Preferences = Me.imports.libs.preferences.Preferences;
const { _, SearchEngines } = Me.imports.libs.utils;

const KeybindingWindow = GObject.registerClass(
class KeybindingWindow extends Adw.Window {
    constructor(transientWindow) {
        super({
            content: new Adw.StatusPage({
                description: _(`Press Backspace to clear shortcut or Esc to cancel`),
                title: _(`Enter a new shortcut`),
            }),
            modal: true,
            resizable: false,
            transient_for: transientWindow,
            width_request: 450,
        });

        this._keybinding = null;

        const keyController = new Gtk.EventControllerKey();
        keyController.connect(`key-pressed`, (...[, keyval, keycode, state]) => {
            switch (keyval) {
                case Gdk.KEY_Escape: {
                    this.close();
                    return Gdk.EVENT_STOP;
                }
                case Gdk.KEY_BackSpace: {
                    this._keybinding = ``;
                    this.close();
                    return Gdk.EVENT_STOP;
                }
                default: {
                    const mask = state & Gtk.accelerator_get_default_mod_mask();
                    if (mask && Gtk.accelerator_valid(keyval, mask)) {
                        const accelerator = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
                        if (accelerator.length > 0) {
                            this._keybinding = accelerator;
                            this.close();
                            return Gdk.EVENT_STOP;
                        }
                    }
                    break;
                }
            }
            return Gdk.EVENT_PROPAGATE;
        });
        this.add_controller(keyController);
    }

    get keybinding() {
        return this._keybinding;
    }
});

const ShortcutRow = GObject.registerClass(
class ShortcutRow extends Adw.ActionRow {
    constructor(title, preferences, preferencesKey) {
        super({
            title: title,
        });

        this._preferences = preferences;
        this._preferencesKey = preferencesKey;

        this.activatable_widget = new Gtk.ShortcutLabel({
            accelerator: this._preferences.getShortcut(this._preferencesKey),
            disabled_text: _(`Disabled`, `Keyboard shortcut is disabled`),
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(this.activatable_widget);

        this._preferences.connect(`shortcutChanged`, (...[, key]) => {
            if (key === this._preferencesKey) {
                this.activatable_widget.accelerator = this._preferences.getShortcut(key);
            }
        });
    }

    vfunc_activate() {
        const window = new KeybindingWindow(this.get_root());
        window.connect(`close-request`, () => {
            const shortcut = window.keybinding;
            if (shortcut !== null) {
                this._preferences.setShortcut(this._preferencesKey, shortcut);
            }
            window.destroy();
        });
        window.present();
    }
});

function init() {
    ExtensionUtils.initTranslations(Me.uuid);
}

function fillPreferencesWindow(window) {
    const preferences = new Preferences();
    preferences.connect(`webSearchEngineChanged`, () => {
        searchEngineDropDown.selected = searchEngines.findIndex(preferences.webSearchEngine);
    });

    const historySizeSpinBox = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 500,
            step_increment: 1,
        }),
        valign: Gtk.Align.CENTER,
    });
    preferences.bind(
        `history-size`,
        historySizeSpinBox,
        `value`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const historySizeRow = new Adw.ActionRow({
        activatable_widget: historySizeSpinBox,
        title: _(`History size`),
    });
    historySizeRow.add_suffix(historySizeSpinBox);

    const generalGroup = new Adw.PreferencesGroup({
        title: _(`General`, `General options`),
    });
    generalGroup.add(historySizeRow);

    const customSearchUrlEntry = new Gtk.Entry({
        placeholder_text: _(`URL with %s in place of query`),
        valign: Gtk.Align.CENTER,
    });
    customSearchUrlEntry.set_size_request(300, -1);
    preferences.bind(
        `custom-web-search-url`,
        customSearchUrlEntry,
        `text`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const customSearchUrlRow = new Adw.ActionRow({
        activatable_widget: customSearchUrlEntry,
        title: _(`Search URL`),
    });
    customSearchUrlRow.add_suffix(customSearchUrlEntry);
    customSearchUrlRow.connect(`notify::visible`, () => {
        if (customSearchUrlRow.visible) {
            customSearchUrlEntry.grab_focus();
        }
    });

    const searchEngines = SearchEngines.get(preferences);
    searchEngines.sort();

    const searchEngineDropDown = new Gtk.DropDown({
        model: Gtk.StringList.new(searchEngines.map((engine) => {
            return engine.title;
        })),
        selected: -1,
        valign: Gtk.Align.CENTER,
    });
    searchEngineDropDown.bind_property_full(
        `selected`,
        customSearchUrlRow,
        `visible`,
        GObject.BindingFlags.DEFAULT,
        () => {
            return [
                true,
                searchEngines[searchEngineDropDown.selected].name === `custom`,
            ];
        },
        null
    );
    searchEngineDropDown.connect(`notify::selected`, () => {
        preferences.webSearchEngine = searchEngines[searchEngineDropDown.selected].name;
    });
    searchEngineDropDown.selected = searchEngines.findIndex(preferences.webSearchEngine);

    const searchEngineRow = new Adw.ActionRow({
        activatable_widget: searchEngineDropDown,
        title: _(`Search Engine`),
    });
    searchEngineRow.add_suffix(searchEngineDropDown);

    const webSearchGroup = new Adw.PreferencesGroup({
        title: _(`Web Search`),
    });
    webSearchGroup.add(searchEngineRow);
    webSearchGroup.add(customSearchUrlRow);

    const keybindingGroup = new Adw.PreferencesGroup({
        title: _(`Keyboard Shortcuts`),
    });
    keybindingGroup.add(new ShortcutRow(
        _(`Toggle menu`),
        preferences,
        preferences._keyToggleMenuShortcut
    ));
    keybindingGroup.add(new ShortcutRow(
        _(`Toggle private mode`),
        preferences,
        preferences._keyTogglePrivateModeShortcut
    ));
    keybindingGroup.add(new ShortcutRow(
        _(`Clear history`),
        preferences,
        preferences._keyClearHistoryShortcut
    ));

    const page = new Adw.PreferencesPage();
    page.add(generalGroup);
    page.add(webSearchGroup);
    page.add(keybindingGroup);

    window.add(page);
}
