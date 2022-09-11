'use strict';

const { Clutter, Cogl, Gio, GLib, GObject, Meta, Pango, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const QrCode = Me.imports.qrcodegen.qrcodegen.QrCode;
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
        this._selectionOwnerChangedId = this._selection.connect(
            'owner-changed',
            (...[, selectionType]) => {
                if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                    this.emit('changed');
                }
            }
        );
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

const PlaceholderMenuItem = class extends PopupMenu.PopupMenuSection {
    constructor() {
        super({
            reactive: false,
        });

        this.actor.style_class = 'popup-menu-item';

        const icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'edit-copy' }),
            x_align: Clutter.ActorAlign.CENTER,
        });

        const label = new St.Label({
            text: _('History is Empty'),
            x_align: Clutter.ActorAlign.CENTER,
        });

        const boxLayout = new St.BoxLayout({
            style_class: 'clipman-placeholderpanel',
            vertical: true,
            x_expand: true,
        });
        boxLayout.add(icon);
        boxLayout.add(label);
        this.actor.add(boxLayout);
    }
}

const HistoryMenuSection = class extends PopupMenu.PopupMenuSection {
    constructor() {
        super();

        this.entry = new St.Entry({
            hint_text: _('Type to search...'),
            style_class: 'clipman-popupsearchmenuitem',
            x_expand: true,
        });
        this.entry.clutter_text.connect('text-changed', this._onEntryTextChanged.bind(this));
        const searchMenuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
        });
        searchMenuItem.add(this.entry);
        this.addMenuItem(searchMenuItem);

        const placeholderLabel = new St.Label({
            text: _('No Matches'),
            x_align: Clutter.ActorAlign.CENTER,
        });
        const placeholderBoxLayout = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        placeholderBoxLayout.add(placeholderLabel);
        this._placeholderMenuItem = new PopupMenu.PopupMenuSection({
            reactive: false,
        });
        this._placeholderMenuItem.actor.style_class = 'popup-menu-item';
        this._placeholderMenuItem.actor.visible = false;
        this._placeholderMenuItem.actor.add(placeholderBoxLayout);
        this.addMenuItem(this._placeholderMenuItem);

        this.section = new PopupMenu.PopupMenuSection();
        this.section.box.connect('actor-added', this._onMenuItemAdded.bind(this));
        this._sectionActorRemovedId = this.section.box.connect(
            'actor-removed',
            this._onMenuItemRemoved.bind(this)
        );
        this.scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: 'clipman-popuphistorymenusection',
        });
        this.scrollView.add_actor(this.section.actor);
        const menuSection = new PopupMenu.PopupMenuSection();
        menuSection.actor.add_actor(this.scrollView);
        this.addMenuItem(menuSection);
    }

    destroy() {
        this.section.box.disconnect(this._sectionActorRemovedId);
    }

    _onEntryTextChanged() {
        const searchText = this.entry.text.toLowerCase();
        const menuItems = this.section._getMenuItems();
        menuItems.forEach((menuItem) => {
            menuItem.actor.visible = menuItem.text.toLowerCase().includes(searchText);
        });

        if (searchText.length === 0) {
            this._placeholderMenuItem.actor.visible = false;
        } else {
            const hasVisibleMenuItems = menuItems.some((menuItem) => {
                return menuItem.actor.visible;
            });
            this._placeholderMenuItem.actor.visible = !hasVisibleMenuItems;
        }
    }

    _onMenuItemAdded(_, menuItem) {
        const searchText = this.entry.text.toLowerCase();
        if (searchText.length > 0) {
            menuItem.actor.visible = menuItem.text.toLowerCase().includes(searchText);
            if (menuItem.actor.visible) {
                this._placeholderMenuItem.actor.visible = false;
            }
        }
    }

    _onMenuItemRemoved() {
        const searchText = this.entry.text.toLowerCase();
        if (searchText.length > 0) {
            const menuItems = this.section._getMenuItems();
            const hasVisibleMenuItems = menuItems.some((menuItem) => {
                return menuItem.actor.visible;
            });
            this._placeholderMenuItem.actor.visible = !hasVisibleMenuItems;
        }
    }
}

const QrCodeDialog = GObject.registerClass(
class QrCodeDialog extends ModalDialog.ModalDialog {
    _init(text) {
        super._init();

        const image = this._generateQrCodeImage(text);
        if (image) {
            const icon = new St.Icon({
                gicon: image,
                icon_size: image.preferred_width,
            });
            this.contentLayout.add_child(icon);
        } else {
            const label = new St.Label({
                text: _('Failed to generate QR code'),
            });
            this.contentLayout.add_child(label);
        }

        this.addButton({
            key: Clutter.KEY_Escape,
            label: _("Close"),
            action: () => {
                this.close();
            },
        });
    }

    _generateQrCodeImage(text) {
        let image;
        try {
            const borderSize = 20;
            const minContentSize = 400;
            const bytesPerPixel = 3;
            const qrCode = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
            const pixelsPerModule = Math.max(10, Math.round(minContentSize / qrCode.size));
            const finalIconSize = qrCode.size * pixelsPerModule + 2 * borderSize;
            const data = new Uint8Array(finalIconSize * finalIconSize * pixelsPerModule * bytesPerPixel);
            data.fill(255);
            for (let qrCodeY = 0; qrCodeY < qrCode.size; ++qrCodeY) {
                for (let i = 0; i < pixelsPerModule; ++i) {
                    const dataY = borderSize + qrCodeY * pixelsPerModule + i;
                    for (let qrCodeX = 0; qrCodeX < qrCode.size; ++qrCodeX) {
                        const color = qrCode.getModule(qrCodeX, qrCodeY) ? 0 : 255;
                        for (let j = 0; j < pixelsPerModule; ++j) {
                            const dataX = borderSize + qrCodeX * pixelsPerModule + j;
                            const dataI = finalIconSize * bytesPerPixel * dataY + bytesPerPixel * dataX;
                            data[dataI] = color;     // R
                            data[dataI + 1] = color; // G
                            data[dataI + 2] = color; // B
                        }
                    }
                }
            }

            image = new St.ImageContent({
                preferred_height: finalIconSize,
                preferred_width: finalIconSize,
            });
            image.set_bytes(new GLib.Bytes(data), Cogl.PixelFormat.RGB_888, finalIconSize, finalIconSize, finalIconSize * bytesPerPixel);
        } catch (e) {
            console.log('clipman@popov895.ukr.net: ' + e);
        }

        return image;
    }
});

const PanelIndicator = GObject.registerClass(
class PanelIndicator extends PanelMenu.Button {
    _init() {
        super._init(0);

        this.menu.actor.add_style_class_name('clipman-panelmenu-button');

        this._buildIcon();
        this._buildMenu();

        this._clipboard = new ClipboardManager();
        this._clipboardChangedId = this._clipboard.connect('changed', () => {
            this._clipboard.getText((text) => {
                this._onClipboardTextChanged(text);
            });
        });

        this._settings = new Settings();
        this._settings.connect('historySizeChanged', this._onHistorySizeChanged.bind(this));

        this._loadState();
        this._addKeybindings();
    }

    destroy() {
        this._saveState();
        this._removeKeybindings();

        this._historyMenuSection.section.box.disconnect(this._historySectionActorRemovedId);
        this._historyMenuSection.destroy();

        this._clipboard.disconnect(this._clipboardChangedId);
        this._clipboard.destroy();

        if (this._searchMenuItemFocusCallbackId) {
            Mainloop.source_remove(this._searchMenuItemFocusCallbackId);
        }

        super.destroy();
    }

    _buildIcon() {
        this._icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'edit-copy-symbolic' }),
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);
    }

    _buildMenu() {
        this._placeholderMenuItem = new PlaceholderMenuItem();
        this.menu.addMenuItem(this._placeholderMenuItem);

        this._historyMenuSection = new HistoryMenuSection();
        this._historyMenuSection.actor.visible = false;
        this._historyMenuSection.section.box.connect(
            'actor-added',
            this._onHistoryMenuSectionChanged.bind(this)
        );
        this._historySectionActorRemovedId = this._historyMenuSection.section.box.connect(
            'actor-removed',
            this._onHistoryMenuSectionChanged.bind(this)
        );
        this.menu.addMenuItem(this._historyMenuSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._clearMenuItem = new PopupMenu.PopupMenuItem(_('Clear History'));
        this._clearMenuItem.actor.visible = false;
        this._clearMenuItem.connect('activate', () => {
            this.menu.close();
            if (this._currentMenuItem) {
                this._clipboard.clear();
            }
            this._historyMenuSection.section.removeAll();
        });
        this.menu.addMenuItem(this._clearMenuItem);

        this._trackChangesMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Track Changes'), true, {
            reactive: true,
        });
        this.menu.addMenuItem(this._trackChangesMenuItem);

        const settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsMenuItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(settingsMenuItem);

        this.menu.connect('open-state-changed', (...[, open]) => {
            if (open) {
                this._historyMenuSection.scrollView.vscroll.adjustment.value = 0;
                this._historyMenuSection.entry.text = '';
                this._searchMenuItemFocusCallbackId = Mainloop.timeout_add(1, () => {
                    global.stage.set_key_focus(this._historyMenuSection.entry);
                    this._searchMenuItemFocusCallbackId = null;
                });
            }
        });
    }

    _createMenuItem(text) {
        const menuItemText = text.replace(/^\s+|\s+$/g, (match) => {
            return match.replace(/ /g, '␣').replace(/\t/g, '⇥').replace(/\n/g, '↵');
        }).replaceAll(/\s+/g, ' ');

        const menuItem = new PopupMenu.PopupMenuItem(menuItemText);
        menuItem.text = text;
        menuItem.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        menuItem.connect('activate', () => {
            this.menu.close();
            this._clipboard.setText(menuItem.text);
        });
        menuItem.connect('destroy', () => {
            if (this._currentMenuItem === menuItem) {
                this._currentMenuItem = null;
            }
        });

        const qrCodeIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'send-to-symbolic' }),
            style_class: 'system-status-icon',
        });
        const qrCodeButton = new St.Button({
            can_focus: true,
            child: qrCodeIcon,
            style_class: 'clipman-toolbutton',
        });
        qrCodeButton.connect('clicked', () => {
            this.menu.close();
            this._showQrCode(menuItem.text);
        });

        const deleteIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'edit-delete-symbolic' }),
            style_class: 'system-status-icon',
        });
        const deleteButton = new St.Button({
            can_focus: true,
            child: deleteIcon,
            style_class: 'clipman-toolbutton',
        });
        deleteButton.connect('clicked', () => {
            if (this._historyMenuSection.section.numMenuItems === 1) {
                this.menu.close();
            }
            this._destroyMenuItem(menuItem);
        });

        const boxLayout = new St.BoxLayout({
            style_class: 'clipman-toolbuttonnpanel',
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        boxLayout.add(qrCodeButton);
        boxLayout.add(deleteButton);
        menuItem.actor.add(boxLayout);

        return menuItem;
    }

    _destroyMenuItem(menuItem) {
        if (this._currentMenuItem === menuItem) {
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

    _showQrCode(text) {
        new QrCodeDialog(text).open();
    }

    _loadState() {
        if (panelIndicator.state.history.length > 0) {
            panelIndicator.state.history.forEach((text) => {
                const menuItem = this._createMenuItem(text);
                this._historyMenuSection.section.addMenuItem(menuItem);
            });
            panelIndicator.state.history.length = 0;
            this._clipboard.getText((text) => {
                if (text && text.length > 0) {
                    const menuItems = this._historyMenuSection.section._getMenuItems();
                    this._currentMenuItem = menuItems.find((menuItem) => {
                        return menuItem.text === text;
                    });
                    this._currentMenuItem?.setOrnament(PopupMenu.Ornament.DOT);
                }
            });
        }

        this._trackChangesMenuItem.setToggleState(panelIndicator.state.trackChanges);
    }

    _saveState() {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        panelIndicator.state.history = menuItems.map((menuItem) => {
            return menuItem.text;
        });

        panelIndicator.state.trackChanges = this._trackChangesMenuItem.state;
    }

    _onClipboardTextChanged(text) {
        let matchedMenuItem;
        if (text && text.length > 0) {
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

    _onHistoryMenuSectionChanged() {
        const menuItemsCount = this._historyMenuSection.section.numMenuItems;
        this._placeholderMenuItem.actor.visible = menuItemsCount === 0;
        this._historyMenuSection.actor.visible = menuItemsCount > 0;
        this._clearMenuItem.actor.visible = menuItemsCount > 0;
    }
});

const panelIndicator = {
    instance: null,
    state: {
        history: [],
        trackChanges: true
    }
};

function init() {
    ExtensionUtils.initTranslations(Me.uuid);
}

function enable() {
    panelIndicator.instance = new PanelIndicator();
    Main.panel.addToStatusArea(`${Me.metadata.name}`, panelIndicator.instance);
}

function disable() {
    panelIndicator.instance.destroy();
    panelIndicator.instance = null;
}
