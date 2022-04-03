'use strict';

const { Gdk, Gio, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;

const Me = ExtensionUtils.getCurrentExtension();
const _ = Gettext.domain(Me.uuid).gettext;

const Settings = GObject.registerClass({
    Signals: {
        'toggleMenuShortcutChanged': {},
    },
}, class Settings extends GObject.Object {
    _init() {
        super._init();

        this._keyToggleMenuShortcut = 'toggle-menu-shortcut';

        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.clipman');
        this._settings.connect('changed', (...[, key]) => {
            if (key === this._keyToggleMenuShortcut) {
                this.emit('toggleMenuShortcutChanged');
            }
        });
    }

    get toggleMenuShortcut() {
        return this._settings.get_strv(this._keyToggleMenuShortcut)[0] ?? '';
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
    _init(settings) {
        super._init();

        this._updateLabel();

        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (...[, keyval, keycode, state]) => {
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
                        settings.toggleMenuShortcut = '';
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
        focusController.connect('leave', () => {
            this.set_active(false);
        });
        this.add_controller(focusController);

        this.connect('toggled', this._updateLabel.bind(this));
    }

    _updateLabel() {
        if (this.active) {
            this.label = _('Enter the new shortcut');
        } else {
            this.label = _('Change');
        }
    }
});

function init() {
    ExtensionUtils.initTranslations(Me.uuid);
}

function buildPrefsWidget() {
    const settings = new Settings();
    settings.connect('toggleMenuShortcutChanged', () => {
        keybindingShortcutLabel.accelerator = settings.toggleMenuShortcut;
    });

    const historySizeLabel = new Gtk.Label({
        halign: Gtk.Align.START,
        hexpand: true,
        label: _('History size'),
    });

    const historySizeSpinBox = new Gtk.SpinButton({
        halign: Gtk.Align.START,
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 500,
            step_increment: 1,
        }),
    });
    settings.bind(
        'history-size',
        historySizeSpinBox,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );

    const keybindingLabel = new Gtk.Label({
        halign: Gtk.Align.START,
        hexpand: true,
        label: _('Shortcut to toggle menu'),
    });

    const keybindingShortcutLabel = new Gtk.ShortcutLabel({
        accelerator: settings.toggleMenuShortcut,
        disabled_text: _('Disabled'),
    });

    const keybindingButton = new KeybindingButton(settings);

    const grid = new Gtk.Grid({
        column_spacing: 18,
        halign: Gtk.Align.CENTER,
        margin_bottom: 10,
        margin_end: 10,
        margin_start: 10,
        margin_top: 10,
        row_spacing: 12,
        valign: Gtk.Align.CENTER,
    });
    grid.attach(historySizeLabel, 0, 0, 1, 1);
    grid.attach(historySizeSpinBox, 1, 0, 2, 1);
    grid.attach(keybindingLabel, 0, 1, 1, 1);
    grid.attach(keybindingShortcutLabel, 1, 1, 1, 1);
    grid.attach(keybindingButton, 2, 1, 1, 1);

    return grid;
}
