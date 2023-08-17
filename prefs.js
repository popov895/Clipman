'use strict';

const { Adw, Gdk, Gio, GObject, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const { Preferences } = Me.imports.libs.preferences;
const { _, Connectable, SearchEngines } = Me.imports.libs.utils;

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

        Connectable.makeConnectable(this);

        this._keybinding = null;

        const keyController = new Gtk.EventControllerKey();
        this.connectTo(keyController, `key-pressed`, (...[, keyval, keycode, state]) => {
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

        Connectable.makeConnectable(this);

        this._preferences = preferences;
        this._preferencesKey = preferencesKey;

        this.activatable_widget = new Gtk.ShortcutLabel({
            accelerator: this._preferences.getShortcut(this._preferencesKey),
            disabled_text: _(`Disabled`, `Keyboard shortcut is disabled`),
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(this.activatable_widget);

        this.connectTo(this._preferences, `shortcutChanged`, (...[, key]) => {
            if (key === this._preferencesKey) {
                this.activatable_widget.accelerator = this._preferences.getShortcut(key);
            }
        });
    }

    vfunc_activate() {
        const window = new KeybindingWindow(this.get_root());
        this.connectTo(window, `close-request`, () => {
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
    Connectable.makeConnectable(window);

    window._preferences = new Preferences();
    window.connectTo(window, `close-request`, () => {
        window._preferences.destroy();
    });

    const historySizeSpinBox = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 500,
            step_increment: 1,
        }),
        valign: Gtk.Align.CENTER,
    });
    window._preferences.bind(
        window._preferences._keyHistorySize,
        historySizeSpinBox,
        `value`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const historySizeRow = new Adw.ActionRow({
        activatable_widget: historySizeSpinBox,
        title: _(`History size`),
    });
    historySizeRow.add_suffix(historySizeSpinBox);

    const surroundingWhitespaceSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
    });
    window._preferences.bind(
        window._preferences._keyShowSurroundingWhitespace,
        surroundingWhitespaceSwitch,
        `active`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const surroundingWhitespaceRow = new Adw.ActionRow({
        activatable_widget: surroundingWhitespaceSwitch,
        title: _(`Show leading and trailing whitespace`),
    });
    surroundingWhitespaceRow.add_suffix(surroundingWhitespaceSwitch);

    const colorPreviewSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
    });
    window._preferences.bind(
        window._preferences._keyShowColorPreview,
        colorPreviewSwitch,
        `active`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const colorPreviewRow = new Adw.ActionRow({
        activatable_widget: colorPreviewSwitch,
        title: _(`Show color preview`),
    });
    colorPreviewRow.add_suffix(colorPreviewSwitch);

    const generalGroup = new Adw.PreferencesGroup({
        title: _(`General`, `General options`),
    });
    generalGroup.add(historySizeRow);
    generalGroup.add(surroundingWhitespaceRow);
    generalGroup.add(colorPreviewRow);

    const customSearchUrlEntry = new Gtk.Entry({
        placeholder_text: _(`URL with %s in place of query`),
        valign: Gtk.Align.CENTER,
    });
    customSearchUrlEntry.set_size_request(300, -1);
    window._preferences.bind(
        window._preferences._keyCustomWebSearchUrl,
        customSearchUrlEntry,
        `text`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const customSearchUrlRow = new Adw.ActionRow({
        activatable_widget: customSearchUrlEntry,
        title: _(`Search URL`),
    });
    customSearchUrlRow.add_suffix(customSearchUrlEntry);
    window.connectTo(customSearchUrlRow, `notify::visible`, () => {
        if (customSearchUrlRow.visible) {
            customSearchUrlEntry.grab_focus();
        }
    });

    const searchEngines = SearchEngines.get(window._preferences);
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
    window.connectTo(searchEngineDropDown, `notify::selected`, () => {
        window._preferences.webSearchEngine = searchEngines[searchEngineDropDown.selected].name;
    });
    searchEngineDropDown.selected = searchEngines.findIndex(window._preferences.webSearchEngine);
    window.connectTo(window._preferences, `webSearchEngineChanged`, () => {
        searchEngineDropDown.selected = searchEngines.findIndex(window._preferences.webSearchEngine);
    });

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
        window._preferences,
        window._preferences._keyToggleMenuShortcut
    ));
    keybindingGroup.add(new ShortcutRow(
        _(`Toggle private mode`),
        window._preferences,
        window._preferences._keyTogglePrivateModeShortcut
    ));
    keybindingGroup.add(new ShortcutRow(
        _(`Clear history`),
        window._preferences,
        window._preferences._keyClearHistoryShortcut
    ));

    const page = new Adw.PreferencesPage();
    page.add(generalGroup);
    page.add(webSearchGroup);
    page.add(keybindingGroup);

    window.add(page);
}
