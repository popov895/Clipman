'use strict';

const { Clutter, Gio, GLib, GObject, Meta, Pango, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const _ = Gettext.domain(Me.uuid).gettext;

const Settings = GObject.registerClass({
    Signals: {
        'historySizeChanged': {},
    },
}, class Settings extends GObject.Object {
    _init() {
        super._init();

        this._keyHistorySize = 'history-size';

        this.settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.clipman');
        this.settings.connect('changed', (...[, key]) => {
            if (key === this._keyHistorySize) {
                this.emit('historySizeChanged');
            }
        });
    }

    get historySize() {
        return this.settings.get_int(this._keyHistorySize);
    }
});

const ClipboardManager = GObject.registerClass({
    Signals: {
        'changed': {},
    },
}, class ClipboardManager extends GObject.Object {
    _init() {
        super._init();

        this._clipboard = St.Clipboard.get_default();
        this._selection = Shell.Global.get().get_display().get_selection();
        this._selectionOwnerChangedId = this._selection.connect('owner-changed', (...[, selectionType]) => {
            if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                this.emit('changed');
            }
        });
    }

    destroy() {
        this._selection.disconnect(this._selectionOwnerChangedId);
    }

    getText(callback) {
        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (...[, text]) => {
            callback(text);
        });
    }

    setText(text) {
        this._clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    }

    clear() {
        this._clipboard.set_content(St.ClipboardType.CLIPBOARD, '', new GLib.Bytes(null));
    }
});

const PopupSearchMenuItem = GObject.registerClass(
class PopupSearchMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init() {
        super._init({
            reactive: false,
        });

        this.entry = new St.Entry({
            hint_text: _('Type to search...'),
            style_class: 'clipman-popupsearchmenuitem',
            x_expand: true,
        });
        this.add(this.entry);
    }
});

const PopupHistoryMenuSection = class extends PopupMenu.PopupMenuSection {
    constructor() {
        super();

        this.section = new PopupMenu.PopupMenuSection();
        this.scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: 'clipman-popuphistorymenusection',
        });
        this.scrollView.add_actor(this.section.actor);
        this.actor.add_actor(this.scrollView);
    }
}

const PanelIndicator = GObject.registerClass(
class PanelIndicator extends PanelMenu.Button {
    _init() {
        super._init(0);

        this.menu.actor.add_style_class_name('clipman-panelmenu-button');

        this._buildIcon();
        this._buildMenu();

        this._clipboard = new ClipboardManager();
        this._clipboard.connect('changed', () => {
            this._clipboard.getText((text) => {
                this._onClipboardTextChanged(text);
            });
        });

        this._settings = new Settings();
        this._settings.connect('historySizeChanged', this._onHistorySizeChanged.bind(this));

        this._addKeybindings();
    }

    destroy() {
        this._removeKeybindings();
        this._clipboard.destroy();

        if (this._searchMenuItemFocusCallbackId) {
            Mainloop.source_remove(this._searchMenuItemFocusCallbackId);
        }

        super.destroy();
    }

    _buildIcon() {
        this._icon = new St.Icon({
            icon_name: 'edit-paste-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);
    }

    _buildMenu() {
        this._searchMenuItem = new PopupSearchMenuItem();
        this._searchMenuItem.entry.clutter_text.connect('text-changed', () => {
            const text = this._searchMenuItem.entry.text.toLowerCase();
            const menuItems = this._historyMenuSection.section._getMenuItems();
            menuItems.forEach((menuItem) => {
                menuItem.actor.visible = menuItem.text.toLowerCase().includes(text);
            });
        });
        this.menu.addMenuItem(this._searchMenuItem);

        this._historyMenuSection = new PopupHistoryMenuSection();
        this.menu.addMenuItem(this._historyMenuSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._trackChangesMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Track changes'), true, {
            reactive: true,
        });
        this.menu.addMenuItem(this._trackChangesMenuItem);

        const clearMenuItem = new PopupMenu.PopupMenuItem(_('Clear history'));
        clearMenuItem.connect('activate', () => {
            this.menu.close();
            this._historyMenuSection.section.removeAll();
            if (this._currentMenuItem) {
                this._currentMenuItem = null;
                this._clipboard.clear();
            }
        });
        this.menu.addMenuItem(clearMenuItem);

        const settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsMenuItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(settingsMenuItem);

        this.menu.connect('open-state-changed', (...[, open]) => {
            if (open) {
                this._historyMenuSection.scrollView.vscroll.adjustment.value = 0;
                this._searchMenuItem.entry.text = '';
                this._searchMenuItemFocusCallbackId = Mainloop.timeout_add(1, () => {
                    global.stage.set_key_focus(this._searchMenuItem.entry);
                    this._searchMenuItemFocusCallbackId = null;
                });
            }
        });
    }

    _createMenuItem(text) {
        const menuItemText = text.replace(/^\s+|\s+$/g, (match) => {
            return match.replace(/ /g, '␣').replace(/\t/g, '↹').replace(/\n/g, '↵');
        }).replaceAll(/\s+/g, ' ');

        const menuItem = new PopupMenu.PopupMenuItem(menuItemText);
        menuItem.text = text;
        menuItem.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        menuItem.connect('activate', () => {
            this.menu.close();
            this._clipboard.setText(menuItem.text);
        });

        const deleteIcon = new St.Icon({
            icon_name: 'edit-delete-symbolic',
            style_class: 'system-status-icon',
        });
        const deleteButton = new St.Button({
            child: deleteIcon,
            style_class: 'clipman-deletebutton',
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        menuItem.actor.add_child(deleteButton);
        deleteButton.connect('clicked', () => {
            this._destroyMenuItem(menuItem);
            if (this._historyMenuSection.section._getMenuItems().length === 0) {
                this.menu.close();
            }
        });

        return menuItem;
    }

    _destroyMenuItem(menuItem) {
        if (this._currentMenuItem === menuItem) {
            this._currentMenuItem = null;
            this._clipboard.clear();
        }
        menuItem.destroy();
    }

    _addKeybindings() {
        Main.wm.addKeybinding(
            'toggle-menu-shortcut',
            this._settings.settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => {
                this.menu.toggle();
            }
        );
    }

    _removeKeybindings() {
        Main.wm.removeKeybinding('toggle-menu-shortcut');
    }

    _onClipboardTextChanged(text) {
        let matchedMenuItem;
        if (text && text !== '') {
            const menuItems = this._historyMenuSection.section._getMenuItems();
            matchedMenuItem = menuItems.find((menuItem) => {
                return menuItem.text === text;
            });
            if (matchedMenuItem) {
                this._historyMenuSection.section.moveMenuItem(matchedMenuItem, 0);
            } else if (this._trackChangesMenuItem.state) {
                if (menuItems.length === this._settings.historySize) {
                    this._destroyMenuItem(menuItems.pop());
                }
                matchedMenuItem = this._createMenuItem(text);
                this._historyMenuSection.section.addMenuItem(matchedMenuItem, 0);
            }
        }

        if (this._currentMenuItem !== matchedMenuItem) {
            this._currentMenuItem?.setOrnament(PopupMenu.Ornament.NONE);
            this._currentMenuItem = matchedMenuItem;
            this._currentMenuItem?.setOrnament(PopupMenu.Ornament.DOT);
        }
    }

    _onHistorySizeChanged() {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        const menuItemsToRemove = menuItems.slice(this._settings.historySize);
        menuItemsToRemove.forEach((menuItem) => {
            this._destroyMenuItem(menuItem);
        });
    }
});

let panelIndicator;

function init() {
    ExtensionUtils.initTranslations(Me.uuid);
}

function enable() {
    panelIndicator = new PanelIndicator();
    Main.panel.addToStatusArea(`${Me.metadata.name}`, panelIndicator);
}

function disable() {
    panelIndicator.destroy();
    panelIndicator = null;
}
