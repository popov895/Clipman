'use strict';

const { Adw, Gdk, Gio, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;

const Settings = GObject.registerClass({
    Signals: {
        'toggleMenuShortcutChanged': {},
    },
}, class Settings extends GObject.Object {
    _init() {
        super._init();

        this._keyToggleMenuShortcut = `toggle-menu-shortcut`;

        this._settings = ExtensionUtils.getSettings();
        this._settings.connect(`changed::${this._keyToggleMenuShortcut}`, () => {
            this.emit(`toggleMenuShortcutChanged`);
        });
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

const KeybindingButton = GObject.registerClass(
class KeybindingButton extends Gtk.ToggleButton {
    _init(settings, params) {
        super._init(params);

        this._updateLabel();

        const keyController = new Gtk.EventControllerKey();
        keyController.connect(`key-pressed`, (...[, keyval, keycode, state]) => {
            if (this.active) {
                switch (keyval) {
                    case Gdk.KEY_Alt_L:
                    case Gdk.KEY_Alt_R:
                    case Gdk.KEY_Control_L:
                    case Gdk.KEY_Control_R:
                    case Gdk.KEY_Hyper_L:
                    case Gdk.KEY_Hyper_R:
                    case Gdk.KEY_Meta_L:
                    case Gdk.KEY_Meta_R:
                    case Gdk.KEY_Shift_L:
                    case Gdk.KEY_Shift_R:
                    case Gdk.KEY_Super_L:
                    case Gdk.KEY_Super_R:
                    case Gdk.KEY_Tab:
                        break;
                    case Gdk.KEY_Escape:
                        this.set_active(false);
                        return Gdk.EVENT_STOP;
                    case Gdk.KEY_BackSpace:
                        settings.toggleMenuShortcut = ``;
                        this.set_active(false);
                        return Gdk.EVENT_STOP;
                    default:
                        const mask = state & Gtk.accelerator_get_default_mod_mask();
                        const accelerator = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
                        if (accelerator.length > 0) {
                            settings.toggleMenuShortcut = accelerator;
                            this.set_active(false);
                            return Gdk.EVENT_STOP;
                        }
                        break;
                }
            }
            return Gdk.EVENT_PROPAGATE;
        });
        this.add_controller(keyController);

        const focusController = new Gtk.EventControllerFocus();
        focusController.connect(`leave`, () => {
            this.set_active(false);
        });
        this.add_controller(focusController);

        this.connect(`toggled`, this._updateLabel.bind(this));
        this.connect(`toggled`, () => {
            if (this.active) {
                this.root.get_surface().inhibit_system_shortcuts(null);
            } else {
                this.root.get_surface().restore_system_shortcuts();
            }
        });
    }

    _updateLabel() {
        if (this.active) {
            this.label = _(`Enter the new shortcut`);
        } else {
            this.label = _(`Change`);
        }
    }
});

function init() {
    ExtensionUtils.initTranslations(Me.uuid);
}

function fillPreferencesWindow(window) {
    const settings = new Settings();
    settings.connect(`toggleMenuShortcutChanged`, () => {
        keybindingShortcutLabel.accelerator = settings.toggleMenuShortcut;
    });

    const historySizeSpinBox = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 500,
            step_increment: 1,
        }),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(
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

    const webSearchEntry = new Gtk.Entry({
        placeholder_text: _(`URL with %s in place of query`),
        valign: Gtk.Align.CENTER,
    });
    webSearchEntry.set_size_request(300, -1);
    settings.bind(
        `web-search-url`,
        webSearchEntry,
        `text`,
        Gio.SettingsBindFlags.DEFAULT
    );

    const webSearchRow = new Adw.ActionRow({
        activatable_widget: webSearchEntry,
        title: _(`Web Search`),
    });
    webSearchRow.add_suffix(webSearchEntry);

    const generalGroup = new Adw.PreferencesGroup({
        title: _(`General`),
    });
    generalGroup.add(historySizeRow);
    generalGroup.add(webSearchRow);

    const keybindingShortcutLabel = new Gtk.ShortcutLabel({
        accelerator: settings.toggleMenuShortcut,
        disabled_text: _(`Disabled`),
        valign: Gtk.Align.CENTER,
    });

    const keybindingButton = new KeybindingButton(settings, {
        valign: Gtk.Align.CENTER,
    });

    const keybindingRow = new Adw.ActionRow({
        activatable_widget: keybindingButton,
        title: _(`Toggle menu`),
    });
    keybindingRow.add_suffix(keybindingShortcutLabel);
    keybindingRow.add_suffix(keybindingButton);

    const keybindingGroup = new Adw.PreferencesGroup({
        title: _(`Keyboard Shortcuts`),
    });
    keybindingGroup.add(keybindingRow);

    const page = new Adw.PreferencesPage();
    page.add(generalGroup);
    page.add(keybindingGroup);

    window.add(page);
}
