'use strict';

const { Clutter, Cogl, Gio, GLib, GObject, Meta, Pango, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const QrCode = Me.imports.qrcodegen.qrcodegen.QrCode;
const _ = Gettext.domain(Me.uuid).gettext;

const sensitiveMimeTypes = [
    'x-kde-passwordManagerHint',
];

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
        const mimeTypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        const hasSensitiveMimeTypes = sensitiveMimeTypes.some((sensitiveMimeType) => {
            return mimeTypes.includes(sensitiveMimeType);
        });
        if (hasSensitiveMimeTypes) {
            callback(null);
        } else {
            this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (...[, text]) => {
                callback(text);
            });
        }
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
        super();

        this.actor.add_style_class_name('popup-menu-item');

        this._icon = new St.Icon({
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._label = new St.Label({
            x_align: Clutter.ActorAlign.CENTER,
        });

        const boxLayout = new St.BoxLayout({
            style_class: 'clipman-placeholderpanel',
            vertical: true,
            x_expand: true,
        });
        boxLayout.add(this._icon);
        boxLayout.add(this._label);
        this.actor.add(boxLayout);
    }

    setIcon(icon) {
        this._icon.gicon = icon;
    }

    setText(text) {
        this._label.text = text;
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
            style_class: 'clipman-searchmenuitem',
        });
        searchMenuItem._ornamentLabel.visible = false;
        searchMenuItem.add(this.entry);
        this.addMenuItem(searchMenuItem);

        const placeholderBoxLayout = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        placeholderBoxLayout.add(new St.Label({
            text: _('No Matches'),
            x_align: Clutter.ActorAlign.CENTER,
        }));
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
            style_class: 'clipman-historyscrollview',
        });
        this.scrollView.hscrollbar_policy = St.PolicyType.NEVER;
        this.scrollView.add_actor(this.section.actor);
        this.scrollView.vscroll.adjustment.connect('changed', () => {
            Promise.resolve().then(() => {
                this.scrollView.overlay_scrollbars = !this.scrollView.vscrollbar_visible;
            });
        });
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
             this.contentLayout.add_child(new St.Icon({
                gicon: image,
                icon_size: image.preferred_width,
            }));
        } else {
            this.contentLayout.add_child(new St.Label({
                text: _('Failed to generate QR code'),
            }));
        }

        this.addButton({
            key: Clutter.KEY_Escape,
            label: _('Close'),
            action: () => {
                this.close();
            },
        });
    }

    _generateQrCodeImage(text) {
        let image;
        try {
            const minContentSize = 200;
            const bytesPerPixel = 3; // RGB
            const qrCode = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
            const pixelsPerModule = Math.max(10, Math.round(minContentSize / qrCode.size));
            const quietZoneSize = 4 * pixelsPerModule;
            const finalIconSize = qrCode.size * pixelsPerModule + 2 * quietZoneSize;
            const data = new Uint8Array(finalIconSize * finalIconSize * pixelsPerModule * bytesPerPixel);
            data.fill(255);
            for (let qrCodeY = 0; qrCodeY < qrCode.size; ++qrCodeY) {
                for (let i = 0; i < pixelsPerModule; ++i) {
                    const dataY = quietZoneSize + qrCodeY * pixelsPerModule + i;
                    for (let qrCodeX = 0; qrCodeX < qrCode.size; ++qrCodeX) {
                        const color = qrCode.getModule(qrCodeX, qrCodeY) ? 0x00 : 0xff;
                        for (let j = 0; j < pixelsPerModule; ++j) {
                            const dataX = quietZoneSize + qrCodeX * pixelsPerModule + j;
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
            console.log(Me.uuid + ': ' + e);
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

        this._pinnedCount = 0;

        this._clipboard = new ClipboardManager();
        this._clipboardChangedId = this._clipboard.connect('changed', () => {
            if (!this._privateModeMenuItem.state) {
                this._clipboard.getText((text) => {
                    this._onClipboardTextChanged(text);
                });
            }
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

        super.destroy();
    }

    _buildIcon() {
        this.add_child(new St.Icon({
            gicon: new Gio.ThemedIcon({ name: 'edit-copy-symbolic' }),
            style_class: 'system-status-icon',
        }));
    }

    _buildMenu() {
        this._privateModePlaceholder = new PlaceholderMenuItem();
        this._privateModePlaceholder.setIcon(Gio.icon_new_for_string(Me.path + '/icons/private-mode-symbolic.svg'));
        this._privateModePlaceholder.setText(_('Private Mode is On'));
        this.menu.addMenuItem(this._privateModePlaceholder);

        this._emptyPlaceholder = new PlaceholderMenuItem();
        this._emptyPlaceholder.setIcon(Gio.icon_new_for_string(Me.path + '/icons/clipboard-symbolic.svg'));
        this._emptyPlaceholder.setText(_('History is Empty'));
        this.menu.addMenuItem(this._emptyPlaceholder);

        this._historyMenuSection = new HistoryMenuSection();
        this._historyMenuSection.section.box.connect(
            'actor-added',
            this._updateUi.bind(this)
        );
        this._historySectionActorRemovedId = this._historyMenuSection.section.box.connect(
            'actor-removed',
            this._updateUi.bind(this)
        );
        this.menu.addMenuItem(this._historyMenuSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._clearMenuItem = new PopupMenu.PopupMenuItem(_('Clear History'));
        this._clearMenuItem.connect('activate', () => {
            this.menu.close();
            const menuItems = this._historyMenuSection.section._getMenuItems();
            const menuItemsToRemove = menuItems.slice(this._pinnedCount);
            menuItemsToRemove.forEach((menuItem) => {
                this._destroyMenuItem(menuItem);
            });
        });
        this.menu.addMenuItem(this._clearMenuItem);

        this._privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Private Mode'), false, {
            reactive: true,
        });
        this._privateModeMenuItem.connect('toggled', (...[, state]) => {
            this.menu.close();
            if (!state) {
                this._currentMenuItem?.setOrnament(PopupMenu.Ornament.NONE);
                this._currentMenuItem = null;
                this._clipboard.getText((text) => {
                    if (text && text.length > 0) {
                        const menuItems = this._historyMenuSection.section._getMenuItems();
                        this._currentMenuItem = menuItems.find((menuItem) => {
                            return menuItem.text === text;
                        });
                        if (this._currentMenuItem) {
                            this._historyMenuSection.section.moveMenuItem(this._currentMenuItem, 0);
                        }
                        this._currentMenuItem?.setOrnament(PopupMenu.Ornament.DOT);
                    }
                });
            }
            this._updateUi();
        });
        this.menu.addMenuItem(this._privateModeMenuItem);

        const settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsMenuItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(settingsMenuItem);

        this.menu.connect('open-state-changed', (...[, open]) => {
            if (open) {
                this._historyMenuSection.scrollView.vscroll.adjustment.value = 0;
                this._historyMenuSection.entry.text = '';
                Promise.resolve().then(() => {
                    global.stage.set_key_focus(this._historyMenuSection.entry);
                });
            }
        });
    }

    _createMenuItem(text, pinned = false, timestamp = Date.now()) {
        const menuItemText = text.replace(/^\s+|\s+$/g, (match) => {
            return match.replace(/ /g, '␣').replace(/\t/g, '⇥').replace(/\n/g, '↵');
        }).replaceAll(/\s+/g, ' ');

        const menuItem = new PopupMenu.PopupMenuItem(menuItemText);
        menuItem.pinned = pinned;
        menuItem.text = text;
        menuItem.timestamp = timestamp;
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

        menuItem.pinIcon = new St.Icon({
            gicon: new Gio.ThemedIcon({ name: menuItem.pinned ? 'starred-symbolic' : 'non-starred-symbolic' }),
            style_class: 'system-status-icon',
        });
        const pinButton = new St.Button({
            can_focus: true,
            child: menuItem.pinIcon,
            style_class: 'clipman-toolbutton',
        });
        pinButton.connect('clicked', () => {
            menuItem.pinned ? this._unpinMenuItem(menuItem) : this._pinMenuItem(menuItem);
        });

        const qrCodeButton = new St.Button({
            can_focus: true,
            child: new St.Icon({
                gicon: Gio.icon_new_for_string(Me.path + '/icons/qrcode-symbolic.svg'),
                style_class: 'system-status-icon',
            }),
            style_class: 'clipman-toolbutton',
        });
        qrCodeButton.connect('clicked', () => {
            this.menu.close();
            this._showQrCode(menuItem.text);
        });

        const deleteButton = new St.Button({
            can_focus: true,
            child: new St.Icon({
                gicon: new Gio.ThemedIcon({ name: 'edit-delete-symbolic' }),
                style_class: 'system-status-icon',
            }),
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
        boxLayout.add(pinButton);
        boxLayout.add(qrCodeButton);
        boxLayout.add(deleteButton);
        menuItem.actor.add(boxLayout);

        return menuItem;
    }

    _destroyMenuItem(menuItem) {
        if (this._currentMenuItem === menuItem) {
            this._clipboard.clear();
        }
        if (menuItem.pinned) {
            --this._pinnedCount;
        }
        menuItem.destroy();
    }

    _pinMenuItem(menuItem) {
        menuItem.pinned = true;
        menuItem.pinIcon.gicon = new Gio.ThemedIcon({ name: 'starred-symbolic' });
        this._historyMenuSection.section.moveMenuItem(menuItem, this._pinnedCount++);

        this._updateUi();
    }

    _unpinMenuItem(menuItem) {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        if (menuItems.length - this._pinnedCount === this._settings.historySize) {
            const lastMenuItem = menuItems[menuItems.length - 1];
            if (menuItem.timestamp < lastMenuItem.timestamp) {
                this._destroyMenuItem(menuItem);
                return;
            }
            this._destroyMenuItem(lastMenuItem);
        }
        menuItem.pinned = false;
        menuItem.pinIcon.gicon = new Gio.ThemedIcon({ name: 'non-starred-symbolic' });
        let indexToMove = menuItems.length;
        for (let i = this._pinnedCount; i < menuItems.length; ++i) {
            if (menuItems[i].timestamp < menuItem.timestamp) {
                indexToMove = i;
                break;
            }
        }
        this._historyMenuSection.section.moveMenuItem(menuItem, indexToMove - 1);
        --this._pinnedCount;

        this._updateUi();
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
            panelIndicator.state.history.forEach((entry) => {
                const menuItem = this._createMenuItem(entry.text, entry.pinned, entry.timestamp);
                this._historyMenuSection.section.addMenuItem(menuItem);
                if (menuItem.pinned) {
                    ++this._pinnedCount;
                }
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

        this._privateModeMenuItem.setToggleState(panelIndicator.state.privateMode);

        this._updateUi();
    }

    _saveState() {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        panelIndicator.state.history = menuItems.map((menuItem) => {
            return {
                pinned: menuItem.pinned,
                text: menuItem.text,
                timestamp: menuItem.timestamp
            };
        });

        panelIndicator.state.privateMode = this._privateModeMenuItem.state;
    }

    _updateUi() {
        const privateMode = this._privateModeMenuItem.state;
        const menuItemsCount = this._historyMenuSection.section.numMenuItems;
        this._privateModePlaceholder.actor.visible = privateMode;
        this._emptyPlaceholder.actor.visible = !privateMode && menuItemsCount === 0;
        this._historyMenuSection.actor.visible = !privateMode && menuItemsCount > 0;
        this._clearMenuItem.actor.visible = !privateMode && menuItemsCount > this._pinnedCount;
    }

    _onClipboardTextChanged(text) {
        let matchedMenuItem;
        if (text && text.length > 0) {
            const menuItems = this._historyMenuSection.section._getMenuItems();
            matchedMenuItem = menuItems.find((menuItem) => {
                return menuItem.text === text;
            });
            if (matchedMenuItem) {
                matchedMenuItem.timestamp = Date.now();
                if (!matchedMenuItem.pinned) {
                    this._historyMenuSection.section.moveMenuItem(matchedMenuItem, this._pinnedCount);
                }
            } else {
                if (menuItems.length - this._pinnedCount === this._settings.historySize) {
                    this._destroyMenuItem(menuItems.pop());
                }
                matchedMenuItem = this._createMenuItem(text);
                this._historyMenuSection.section.addMenuItem(matchedMenuItem, this._pinnedCount);
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
        const menuItemsToRemove = menuItems.slice(this._settings.historySize + this._pinnedCount);
        menuItemsToRemove.forEach((menuItem) => {
            this._destroyMenuItem(menuItem);
        });
    }
});

const panelIndicator = {
    instance: null,
    state: {
        history: [],
        privateMode: false
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
