'use strict';

const { Clutter, Cogl, Gio, GLib, GObject, Graphene, Meta, Pango, Shell, St } = imports.gi;

const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Me = ExtensionUtils.getCurrentExtension();
const { QrCode } = Me.imports.libs.qrcodegen.qrcodegen;
const { Preferences } = Me.imports.libs.preferences;
const Validator = Me.imports.libs.validator.validator;
const { _, log, ColorParser, Connectable, SearchEngines } = Me.imports.libs.utils;

const ClipboardManager = GObject.registerClass({
    Signals: {
        'changed': {},
        'destroy': {},
    },
}, class ClipboardManager extends GObject.Object {
    constructor() {
        super();

        Connectable.makeConnectable(this);

        this._sensitiveMimeTypes = [
            `x-kde-passwordManagerHint`,
        ];

        this._clipboard = St.Clipboard.get_default();
        this._selection = global.get_display().get_selection();
        this.connectTo(this._selection, `owner-changed`,
            (...[, selectionType]) => {
                if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                    this.emit(`changed`);
                }
            }
        );
    }

    destroy() {
        this.emit(`destroy`);
    }

    getText(callback) {
        const mimeTypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        const hasSensitiveMimeTypes = this._sensitiveMimeTypes.some((sensitiveMimeType) => {
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
        this._clipboard.set_content(St.ClipboardType.CLIPBOARD, ``, new GLib.Bytes(null));
    }
});

const PlaceholderMenuItem = class extends PopupMenu.PopupMenuSection {
    constructor(text, icon) {
        super();

        this.actor.add_style_class_name(`popup-menu-item`);

        const boxLayout = new St.BoxLayout({
            style_class: `clipman-placeholderpanel`,
            vertical: true,
            x_expand: true,
        });
        boxLayout.add(new St.Icon({
            gicon: icon,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        boxLayout.add(new St.Label({
            text: text,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        this.actor.add(boxLayout);
    }
};

const QrCodeDialog = GObject.registerClass(
class QrCodeDialog extends ModalDialog.ModalDialog {
    constructor(text) {
        super();

        const image = this._generateQrCodeImage(text);
        if (image) {
            this.contentLayout.add_child(new St.Icon({
                gicon: image,
                icon_size: image.preferred_width,
            }));
        } else {
            this.contentLayout.add_child(new St.Label({
                text: _(`Failed to generate QR code`),
            }));
        }

        this.addButton({
            isDefault: true,
            key: Clutter.KEY_Escape,
            label: _(`Close`, `Close dialog`),
            action: () => {
                this.close();
            },
        });
    }

    _generateQrCodeImage(text) {
        let image;
        try {
            const bytesPerPixel = 3; // RGB
            const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const minPixelsPerModule = 3;
            const maxPixelsPerModule = 10;
            const maxQuietZoneSize = 4 * maxPixelsPerModule;
            const maxIconSize = Math.round(Math.min(global.screen_width, global.screen_height) * 0.9 / scaleFactor);
            const qrCode = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
            const pixelsPerModule = Math.min(
                Math.round((maxIconSize - 2 * maxQuietZoneSize) / qrCode.size),
                maxPixelsPerModule
            );
            if (pixelsPerModule < minPixelsPerModule) {
                throw new Error(`QR code is too large`);
            }
            const quietZoneSize = Math.min(4 * pixelsPerModule, maxQuietZoneSize);
            const iconSize = qrCode.size * pixelsPerModule + 2 * quietZoneSize;
            const data = new Uint8Array(iconSize * iconSize * pixelsPerModule * bytesPerPixel);
            data.fill(255);
            for (let qrCodeY = 0; qrCodeY < qrCode.size; ++qrCodeY) {
                for (let i = 0; i < pixelsPerModule; ++i) {
                    const dataY = quietZoneSize + qrCodeY * pixelsPerModule + i;
                    for (let qrCodeX = 0; qrCodeX < qrCode.size; ++qrCodeX) {
                        const color = qrCode.getModule(qrCodeX, qrCodeY) ? 0x00 : 0xff;
                        for (let j = 0; j < pixelsPerModule; ++j) {
                            const dataX = quietZoneSize + qrCodeX * pixelsPerModule + j;
                            const dataI = iconSize * bytesPerPixel * dataY + bytesPerPixel * dataX;
                            data[dataI] = color;     // R
                            data[dataI + 1] = color; // G
                            data[dataI + 2] = color; // B
                        }
                    }
                }
            }

            image = new St.ImageContent({
                preferred_height: iconSize,
                preferred_width: iconSize,
            });
            image.set_bytes(
                new GLib.Bytes(data),
                Cogl.PixelFormat.RGB_888,
                iconSize,
                iconSize,
                iconSize * bytesPerPixel
            );
        } catch (error) {
            log(error);
        }

        return image;
    }
});

const HistoryMenuSection = class extends PopupMenu.PopupMenuSection {
    constructor() {
        super();

        Connectable.makeConnectable(this);

        this.entry = new St.Entry({
            can_focus: true,
            hint_text: _(`Type to search...`),
            style_class: `clipman-popupsearchmenuitem`,
            x_expand: true,
        });
        this.connectTo(this.entry.clutter_text, `text-changed`, this._onEntryTextChanged.bind(this));
        const searchMenuItem = new PopupMenu.PopupBaseMenuItem({
            can_focus: false,
            reactive: false,
            style_class: `clipman-searchmenuitem`,
        });
        searchMenuItem._ornamentLabel.visible = false;
        searchMenuItem.add(this.entry);
        this.addMenuItem(searchMenuItem);

        const placeholderBoxLayout = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        placeholderBoxLayout.add(new St.Label({
            text: _(`No Matches`),
            x_align: Clutter.ActorAlign.CENTER,
        }));
        this._placeholderMenuItem = new PopupMenu.PopupMenuSection({
            reactive: false,
        });
        this._placeholderMenuItem.actor.style_class = `popup-menu-item`;
        this._placeholderMenuItem.actor.visible = false;
        this._placeholderMenuItem.actor.add(placeholderBoxLayout);
        this.addMenuItem(this._placeholderMenuItem);

        this.section = new PopupMenu.PopupMenuSection();
        this.section.moveMenuItem = function(menuItem, position) {
            Object.getPrototypeOf(this).moveMenuItem.call(this, menuItem, position);
            if (menuItem instanceof PopupMenu.PopupSubMenuMenuItem) {
                this.box.set_child_above_sibling(menuItem.menu.actor, menuItem.actor);
            }
        }.bind(this.section);
        this.connectTo(this.section.box, `actor-added`, (...[, actor]) => {
            if (actor instanceof HistoryMenuItem) {
                this._onMenuItemAdded(actor);
            }
        });
        this.connectTo(this.section.box, `actor-removed`, (...[, actor]) => {
            if (actor instanceof HistoryMenuItem) {
                this._onMenuItemRemoved(actor);
            }
        });
        this.scrollView = new St.ScrollView({
            overlay_scrollbars: true,
            style_class: `clipman-historyscrollview`,
        });
        this.scrollView.hscrollbar_policy = St.PolicyType.NEVER;
        this.scrollView.add_actor(this.section.actor);
        this.connectTo(this.scrollView.vscroll.adjustment, `changed`, () => {
            Promise.resolve().then(() => {
                this.scrollView.overlay_scrollbars = !this.scrollView.vscrollbar_visible;
            });
        });
        const menuSection = new PopupMenu.PopupMenuSection();
        menuSection.actor.add_actor(this.scrollView);
        this.addMenuItem(menuSection);
    }

    _onEntryTextChanged() {
        const searchText = this.entry.text.toLowerCase();
        const menuItems = this.section._getMenuItems();
        menuItems.forEach((menuItem) => {
            menuItem.actor.visible = menuItem.text.toLowerCase().includes(searchText);
            if (!menuItem.actor.visible) {
                menuItem.menu.close();
            }
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

    _onMenuItemAdded(menuItem) {
        const searchText = this.entry.text.toLowerCase();
        if (searchText.length > 0) {
            menuItem.actor.visible = menuItem.text.toLowerCase().includes(searchText);
            if (menuItem.actor.visible) {
                this._placeholderMenuItem.actor.visible = false;
            }
        }
        this.connectTo(menuItem, `key-focus-in`, () => {
            Util.ensureActorVisibleInScrollView(this.scrollView, menuItem);
        });
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
};

const HistoryMenuItem = GObject.registerClass({
    Properties: {
        'showSurroundingWhitespace': GObject.ParamSpec.boolean(
            `showSurroundingWhitespace`, ``, ``,
            GObject.ParamFlags.WRITABLE,
            true
        ),
        'showColorPreview': GObject.ParamSpec.boolean(
            `showColorPreview`, ``, ``,
            GObject.ParamFlags.WRITABLE,
            true
        ),
    },
    Signals: {
        'delete': {},
        'submenuAboutToOpen': {},
        'togglePin': {},
    },
}, class HistoryMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    constructor(text, pinned, timestamp, topMenu) {
        super(``);

        Connectable.makeConnectable(this);

        this.text = text;
        this.pinned = pinned;
        this.timestamp = timestamp;
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        const colorPreview = this._generateColorPreview(this.text);
        if (colorPreview) {
            this.colorPreviewIcon = new St.Icon({
                gicon: colorPreview,
                style_class: `clipman-colorpreview`,
            });
            this.insert_child_at_index(this.colorPreviewIcon, 1);
        }

        // disable animation on opening and closing
        this.menu.open = function() {
            if (!this.menu.isOpen) {
                this.emit(`submenuAboutToOpen`);
                Object.getPrototypeOf(this.menu).open.call(this.menu, false);
            }
        }.bind(this);
        this.menu.close = this.menu.close.bind(this.menu, false);

        this._topMenu = topMenu;
        this.connectTo(this._topMenu, `open-state-changed`, (...[, open]) => {
            if (!open) {
                this.menu.close();
            }
        });

        this.add_child(new St.Bin({
            style_class: `popup-menu-item-expander`,
            x_expand: true,
        }));

        this.pinIcon = new St.Icon({
            icon_name: this.pinned ? `starred-symbolic` : `non-starred-symbolic`,
            style_class: `system-status-icon`,
        });
        const pinButton = new St.Button({
            can_focus: true,
            child: this.pinIcon,
            style_class: `clipman-toolbutton`,
        });
        this.connectTo(pinButton, `clicked`, () => {
            this.emit(`togglePin`);
        });

        const deleteButton = new St.Button({
            can_focus: true,
            child: new St.Icon({
                icon_name: `edit-delete-symbolic`,
                style_class: `system-status-icon`,
            }),
            style_class: `clipman-toolbutton`,
        });
        this.connectTo(deleteButton, `clicked`, () => {
            this.emit(`delete`);
        });

        this._triangleBin.hide();

        this.menu._arrow = new St.Icon({
            icon_name: `pan-end-symbolic`,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.6 }),
            style_class: `system-status-icon`,
        });
        const toggleSubMenuButton = new St.Button({
            can_focus: true,
            child: this.menu._arrow,
            style_class: `clipman-toolbutton`,
        });
        this.connectTo(toggleSubMenuButton, `clicked`, () => {
            this.menu.toggle();
        });

        const boxLayout = new St.BoxLayout({
            style_class: `clipman-toolbuttonnpanel`,
        });
        boxLayout.add(pinButton);
        boxLayout.add(deleteButton);
        boxLayout.add(toggleSubMenuButton);
        this.add_child(boxLayout);

        const clickAction = new Clutter.ClickAction({
            enabled: this._activatable,
        });
        this.connectTo(clickAction, `clicked`, () => {
            this.activate(Clutter.get_current_event());
        });
        this.connectTo(clickAction, `notify::pressed`, () => {
            if (clickAction.pressed) {
                this.add_style_pseudo_class(`active`);
            } else {
                this.remove_style_pseudo_class(`active`);
            }
        });
        this.add_action(clickAction);
    }

    set showSurroundingWhitespace(showSurroundingWhitespace) {
        let text;
        if (showSurroundingWhitespace) {
            text = this.text.replace(/^\s+|\s+$/g, (match) => {
                return match.replace(/ /g, `␣`).replace(/\t/g, `⇥`).replace(/\n/g, `↵`);
            });
        } else {
            text = this.text.trim();
        }
        this.label.text = text.replaceAll(/\s+/g, ` `);
    }

    set showColorPreview(showColorPreview) {
        if (this.colorPreviewIcon) {
            this.colorPreviewIcon.visible = showColorPreview;
        }
    }

    _getTopMenu() {
        return this._topMenu;
    }

    _generateColorPreview(color) {
        let image;
        try {
            const rgba = ColorParser.parse(color);
            if (rgba) {
                const bytesPerPixel = 4; // RGBA
                const iconSize = 16;
                const data = new Uint8Array(iconSize * iconSize * bytesPerPixel);
                for (let y = 0; y < iconSize; ++y) {
                    for (let x = 0; x < iconSize; ++x) {
                        const i = iconSize * bytesPerPixel * y + bytesPerPixel * x;
                        data[i] = rgba[0];             // R
                        data[i + 1] = rgba[1];         // G
                        data[i + 2] = rgba[2];         // B
                        data[i + 3] = rgba[3] ?? 0xff; // A
                    }
                }

                image = new St.ImageContent({
                    preferred_height: iconSize,
                    preferred_width: iconSize,
                });
                image.set_bytes(
                    new GLib.Bytes(data),
                    Cogl.PixelFormat.RGBA_8888,
                    iconSize,
                    iconSize,
                    iconSize * bytesPerPixel
                );
            }
        } catch (error) {
            log(error);
        }

        return image;
    }

    activate(event) {
        this.emit(`activate`, event);
    }

    vfunc_key_press_event(event) {
        switch (event.keyval) {
            case Clutter.KEY_Delete:
            case Clutter.KEY_KP_Delete: {
                this.emit(`delete`);
                return Clutter.EVENT_STOP;
            }
            case Clutter.KEY_asterisk:
            case Clutter.KEY_KP_Multiply: {
                this.emit(`togglePin`);
                return Clutter.EVENT_STOP;
            }
            default:
                break;
        }

        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event() {
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event() {
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event() {
        return Clutter.EVENT_PROPAGATE;
    }
});

const PanelIndicator = GObject.registerClass(
class PanelIndicator extends PanelMenu.Button {
    constructor() {
        super(0);

        Connectable.makeConnectable(this);

        this.menu.actor.add_style_class_name(`clipman-panelmenu-button`);

        this._buildIcon();
        this._buildMenu();

        this._pinnedCount = 0;
        this._qrCodeDialog = null;

        this._clipboard = new ClipboardManager();
        this.connectTo(this._clipboard, `changed`, () => {
            if (!this._privateModeMenuItem.state) {
                this._clipboard.getText((text) => {
                    this._onClipboardTextChanged(text);
                });
            }
        });

        this._preferences = new Preferences();
        this.connectTo(this._preferences, `historySizeChanged`, this._onHistorySizeChanged.bind(this));

        this._loadState();
        this._addKeybindings();
    }

    destroy() {
        this._qrCodeDialog?.close();

        this._saveState();
        this._removeKeybindings();

        this._preferences.destroy();
        this._clipboard.destroy();

        super.destroy();
    }

    _buildIcon() {
        this.add_child(new St.Icon({
            icon_name: `edit-copy-symbolic`,
            style_class: `system-status-icon`,
        }));
    }

    _buildMenu() {
        this._privateModePlaceholder = new PlaceholderMenuItem(
            _(`Private Mode is On`),
            Gio.icon_new_for_string(`${Me.path}/icons/private-mode-symbolic.svg`)
        );
        this.menu.addMenuItem(this._privateModePlaceholder);

        this._emptyPlaceholder = new PlaceholderMenuItem(
            _(`History is Empty`),
            Gio.icon_new_for_string(`${Me.path}/icons/clipboard-symbolic.svg`)
        );
        this.menu.addMenuItem(this._emptyPlaceholder);

        this._historyMenuSection = new HistoryMenuSection();
        this.connectTo(
            this._historyMenuSection.section.box,
            `actor-added`,
            (...[, actor]) => {
                if (actor instanceof HistoryMenuItem) {
                    this._updateUi();
                }
            }
        );
        this.connectTo(
            this._historyMenuSection.section.box,
            `actor-removed`,
            (...[, actor]) => {
                if (actor instanceof HistoryMenuItem) {
                    this._updateUi();
                }
            }
        );
        this.menu.addMenuItem(this._historyMenuSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._clearMenuItem = this.menu.addAction(_(`Clear History`), () => {
            this.menu.close();
            const menuItems = this._historyMenuSection.section._getMenuItems();
            const menuItemsToRemove = menuItems.slice(this._pinnedCount);
            menuItemsToRemove.forEach((menuItem) => {
                this._destroyMenuItem(menuItem);
            });
        });

        this._privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(_(`Private Mode`), false, {
            reactive: true,
        });
        this.connectTo(this._privateModeMenuItem, `toggled`, (...[, state]) => {
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
                            this._historyMenuSection.section.moveMenuItem(this._currentMenuItem, this._pinnedCount);
                        }
                        this._currentMenuItem?.setOrnament(PopupMenu.Ornament.DOT);
                    }
                });
            }
            this._updateUi();
        });
        this.menu.addMenuItem(this._privateModeMenuItem);

        this.menu.addAction(_(`Settings`, `Open settings`), () => {
            ExtensionUtils.openPrefs();
        });

        this.connectTo(this.menu, `open-state-changed`, (...[, open]) => {
            if (open) {
                this._historyMenuSection.scrollView.vscroll.adjustment.value = 0;
                this._historyMenuSection.entry.text = ``;
                Promise.resolve().then(() => {
                    global.stage.set_key_focus(this._historyMenuSection.entry);
                });
            }
        });
    }

    _createMenuItem(text, pinned = false, timestamp = Date.now()) {
        const menuItem = new HistoryMenuItem(text, pinned, timestamp, this.menu);
        this._preferences.bind(
            this._preferences._keyShowSurroundingWhitespace,
            menuItem,
            `showSurroundingWhitespace`,
            Gio.SettingsBindFlags.GET
        );
        this._preferences.bind(
            this._preferences._keyShowColorPreview,
            menuItem,
            `showColorPreview`,
            Gio.SettingsBindFlags.GET
        );
        this.connectTo(menuItem, `activate`, () => {
            this.menu.close();
            this._clipboard.setText(menuItem.text);
        });
        this.connectTo(menuItem, `submenuAboutToOpen`, () => {
            if (menuItem.menu.isEmpty()) {
                this._populateSubMenu(menuItem);
            }
        });
        this.connectTo(menuItem, `togglePin`, () => {
            menuItem.pinned ? this._unpinMenuItem(menuItem) : this._pinMenuItem(menuItem);
        });
        this.connectTo(menuItem, `delete`, () => {
            if (this._historyMenuSection.section.numMenuItems === 1) {
                this.menu.close();
            }
            this._destroyMenuItem(menuItem);
        });
        this.connectTo(menuItem, `destroy`, () => {
            Gio.Settings.unbind(menuItem, `showColorPreview`);
            Gio.Settings.unbind(menuItem, `showSurroundingWhitespace`);
            if (this._currentMenuItem === menuItem) {
                this._currentMenuItem = null;
            }
        });

        return menuItem;
    }

    _destroyMenuItem(menuItem) {
        if (this._currentMenuItem === menuItem) {
            this._clipboard.clear();
        }
        if (menuItem.pinned) {
            --this._pinnedCount;
        }
        if (global.stage.get_key_focus() === menuItem) {
            const menuItems = this._historyMenuSection.section._getMenuItems();
            if (menuItems.length > 1) {
                const isLast = menuItems.indexOf(menuItem) === menuItems.length - 1;
                this._historyMenuSection.section.box.navigate_focus(
                    menuItem,
                    isLast ? St.DirectionType.UP : St.DirectionType.DOWN,
                    false
                );
            }
        }
        menuItem.destroy();
    }

    _pinMenuItem(menuItem) {
        menuItem.pinned = true;
        menuItem.pinIcon.icon_name = `starred-symbolic`;
        this._historyMenuSection.section.moveMenuItem(menuItem, this._pinnedCount++);

        this._updateUi();
    }

    _unpinMenuItem(menuItem) {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        if (menuItems.length - this._pinnedCount === this._preferences.historySize) {
            const lastMenuItem = menuItems[menuItems.length - 1];
            if (menuItem.timestamp < lastMenuItem.timestamp) {
                this._destroyMenuItem(menuItem);
                return;
            }
            this._destroyMenuItem(lastMenuItem);
        }
        menuItem.pinned = false;
        menuItem.pinIcon.icon_name = `non-starred-symbolic`;
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
            this._preferences._keyToggleMenuShortcut,
            this._preferences._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => {
                this.menu.toggle();
            }
        );
        Main.wm.addKeybinding(
            this._preferences._keyTogglePrivateModeShortcut,
            this._preferences._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => {
                this._privateModeMenuItem.toggle();
            }
        );
        Main.wm.addKeybinding(
            this._preferences._keyClearHistoryShortcut,
            this._preferences._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.ALL,
            () => {
                this._clearMenuItem.activate(Clutter.get_current_event());
            }
        );
    }

    _removeKeybindings() {
        Main.wm.removeKeybinding(this._preferences._keyClearHistoryShortcut);
        Main.wm.removeKeybinding(this._preferences._keyTogglePrivateModeShortcut);
        Main.wm.removeKeybinding(this._preferences._keyToggleMenuShortcut);
    }

    _populateSubMenu(menuItem) {
        if (!menuItem.colorPreviewIcon) {
            const actions = [
                {
                    title: _(`Open`, `Open URL`),
                    validator: Validator.isURL,
                    validatorOptions: {
                        protocols: [
                            `http`,
                            `https`,
                            `ftp`,
                            `sftp`,
                            `ssh`,
                            `smb`,
                            `telnet`,
                            `gopher`,
                            `vnc`,
                            `irc`,
                            `irc6`,
                            `ircs`,
                            `git`,
                            `rsync`,
                            `feed`,
                        ],
                        require_protocol: true,
                    },
                },
                {
                    title: _(`Open`, `Open URL`),
                    validator: Validator.isMagnetURI,
                },
                {
                    prefix: `mailto:`,
                    regExp: /^mailto:/i,
                    title: _(`Compose an Email`),
                    validator: Validator.isEmail,
                },
                {
                    prefix: `tel:+`,
                    regExp: /^(tel:)?\+/i,
                    title: _(`Make a Call`),
                    validator: Validator.isMobilePhone,
                },
                {
                    title: _(`Make a Call`),
                    validator: (str) => {
                        return str.match(/^callto:\S+/i);
                    },
                },
            ];

            const trimmedText = menuItem.text.trim();
            for (const action of actions) {
                const capturedText = action.regExp ? trimmedText.replace(action.regExp, ``) : trimmedText;
                if (action.validator(capturedText, action.validatorOptions)) {
                    menuItem.menu.addAction(action.title, () => {
                        this.menu.close();
                        this._launchUri((action.prefix ?? ``) + capturedText);
                    });
                    break;
                }
            }
        }

        menuItem.menu.addAction(_(`Search the Web`), () => {
            this.menu.close();
            this._searchTheWeb(menuItem.text);
        });

        menuItem.menu.addAction(_(`Send via Email`), () => {
            this.menu.close();
            this._launchUri(`mailto:?body=${encodeURIComponent(menuItem.text)}`);
        });

        menuItem.menu.addAction(_(`Show QR Code`), () => {
            this.menu.close();
            this._showQrCode(menuItem.text);
        });
    }

    _showQrCode(text) {
        this._qrCodeDialog = new QrCodeDialog(text);
        this.connectTo(this._qrCodeDialog, `destroy`, () => {
            this._qrCodeDialog = null;
        });
        this._qrCodeDialog.open();
    }

    _launchUri(uri) {
        try {
            Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch {
            notifyError(_(`Failed to launch URI "%s"`).format(uri));
        }
    }

    _searchTheWeb(text) {
        const searchEngines = SearchEngines.get(this._preferences);
        const currentEngine = searchEngines.find(this._preferences.webSearchEngine);

        if (!currentEngine) {
            notifyError(`Unknown search engine`);
            return;
        }

        if (currentEngine.name === `custom`) {
            const validatorOptions = {
                protocols: [
                    `http`,
                    `https`,
                ],
                require_protocol: true,
            };
            if (!currentEngine.url.includes(`%s`) || !Validator.isURL(currentEngine.url, validatorOptions)) {
                notifyError(_(`Invalid search URL "%s"`).format(currentEngine.url));
                return;
            }
        }

        this._launchUri(currentEngine.url.replace(`%s`, encodeURIComponent(text)));
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
        let currentMenuItem;
        if (text && text.length > 0) {
            const menuItems = this._historyMenuSection.section._getMenuItems();
            currentMenuItem = menuItems.find((menuItem) => {
                return menuItem.text === text;
            });
            if (currentMenuItem) {
                currentMenuItem.timestamp = Date.now();
                if (!currentMenuItem.pinned) {
                    this._historyMenuSection.section.moveMenuItem(currentMenuItem, this._pinnedCount);
                }
            } else {
                if (menuItems.length - this._pinnedCount === this._preferences.historySize) {
                    this._destroyMenuItem(menuItems.pop());
                }
                currentMenuItem = this._createMenuItem(text);
                this._historyMenuSection.section.addMenuItem(currentMenuItem, this._pinnedCount);
            }
        }

        if (this._currentMenuItem !== currentMenuItem) {
            this._currentMenuItem?.setOrnament(PopupMenu.Ornament.NONE);
            this._currentMenuItem = currentMenuItem;
            this._currentMenuItem?.setOrnament(PopupMenu.Ornament.DOT);
        }
    }

    _onHistorySizeChanged() {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        const menuItemsToRemove = menuItems.slice(this._preferences.historySize + this._pinnedCount);
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

function notifyError(error) {
    Main.notifyError(Me.metadata.name, error);
}

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
