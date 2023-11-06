'use strict';

const { Clutter, Cogl, Gio, GLib, GObject, Graphene, Meta, Pango, Shell, Soup, St } = imports.gi;

const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const ModalDialog = imports.ui.modalDialog;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const SignalTracker = imports.misc.signalTracker;

const Me = ExtensionUtils.getCurrentExtension();
const { QrCode } = Me.imports.libs.qrcodegen.qrcodegen;
const { Preferences } = Me.imports.libs.preferences;
const { Storage } = Me.imports.libs.storage;
const Validator = Me.imports.libs.validator.validator;
const { _, log, ColorParser, SearchEngines } = Me.imports.libs.utils;

const HistoryKeepingMode = {
    None: 0,
    Pinned: 1,
    All: 2,
};

const ClipboardManager = GObject.registerClass({
    Signals: {
        'changed': {},
        'destroy': {},
    },
}, class ClipboardManager extends GObject.Object {
    constructor() {
        super();

        this._sensitiveMimeTypes = [
            `x-kde-passwordManagerHint`,
        ];

        this._clipboard = St.Clipboard.get_default();
        this._selection = global.get_display().get_selection();
        this._selection.connectObject(
            `owner-changed`,
            (...[, selectionType]) => {
                if (!this.blockSignals && selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                    this.emit(`changed`);
                }
            },
            this
        );
    }

    destroy() {
        this.emit(`destroy`);
    }

    getText() {
        const mimeTypes = this._clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD);
        const hasSensitiveMimeTypes = this._sensitiveMimeTypes.some((sensitiveMimeType) => {
            return mimeTypes.includes(sensitiveMimeType);
        });
        if (hasSensitiveMimeTypes) {
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (...[, text]) => {
                resolve(text);
            });
        });
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

        this.entry = new St.Entry({
            can_focus: true,
            hint_text: _(`Type to search...`),
            style_class: `clipman-popupsearchmenuitem`,
            x_expand: true,
        });
        this.entry.clutter_text.connectObject(`text-changed`, this._onEntryTextChanged.bind(this));
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
        this.section.moveMenuItem = (menuItem, position) => {
            Object.getPrototypeOf(this.section).moveMenuItem.call(this.section, menuItem, position);
            if (menuItem instanceof PopupMenu.PopupSubMenuMenuItem) {
                this.section.box.set_child_above_sibling(menuItem.menu.actor, menuItem.actor);
            }
        };
        this.section.box.connectObject(
            `actor-added`, (...[, actor]) => {
                if (actor instanceof HistoryMenuItem) {
                    this._onMenuItemAdded(actor);
                }
            },
            `actor-removed`, (...[, actor]) => {
                if (actor instanceof HistoryMenuItem) {
                    this._onMenuItemRemoved();
                }
            }
        );
        this.scrollView = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.EXTERNAL,
        });
        this.scrollView.add_actor(this.section.actor);
        this.scrollView.vscroll.adjustment.connectObject(`changed`, () => {
            Promise.resolve().then(() => {
                if (Math.floor(this.scrollView.vscroll.adjustment.upper) > this.scrollView.vscroll.adjustment.page_size) {
                    this.scrollView.vscrollbar_policy = St.PolicyType.ALWAYS;
                } else {
                    this.scrollView.vscrollbar_policy = St.PolicyType.EXTERNAL;
                }
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
        menuItem.connectObject(`key-focus-in`, () => {
            const event = Clutter.get_current_event();
            if (event && event.type() === Clutter.EventType.KEY_PRESS) {
                Util.ensureActorVisibleInScrollView(this.scrollView, menuItem);
            }
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
        'pinned': {},
        'submenuAboutToOpen': {},
    },
}, class HistoryMenuItem extends PopupMenu.PopupSubMenuMenuItem {
    constructor(text, pinned = false, topMenu) {
        super(``);

        this.text = text;
        this.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.menu.actor.enable_mouse_scrolling = false;

        this.setOrnament(PopupMenu.Ornament.NONE);

        this.menu.open = (animate) => {
            if (!this.menu.isOpen) {
                this.emit(`submenuAboutToOpen`);
                Object.getPrototypeOf(this.menu).open.call(this.menu, animate);
            }
        };

        this._topMenu = topMenu;
        this._topMenu.connectObject(`open-state-changed`, (...[, open]) => {
            if (!open) {
                this.menu.close();
            }
        });

        this.add_child(new St.Bin({
            style_class: `popup-menu-item-expander`,
            x_expand: true,
        }));

        const pinIcon = new St.Icon({
            style_class: `system-status-icon`,
        });
        this._pinButton = new St.Button({
            checked: pinned,
            can_focus: true,
            child: pinIcon,
            style_class: `clipman-toolbutton`,
            toggle_mode: true,
        });
        this._pinButton.bind_property_full(
            `checked`,
            pinIcon,
            `icon_name`,
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE,
            () => {
                return [
                    true,
                    this._pinButton.checked ? `starred-symbolic` : `non-starred-symbolic`,
                ];
            },
            null
        );
        this._pinButton.connectObject(`notify::checked`, () => {
            this.emit(`pinned`);
        });

        const deleteButton = new St.Button({
            can_focus: true,
            child: new St.Icon({
                icon_name: `edit-delete-symbolic`,
                style_class: `system-status-icon`,
            }),
            style_class: `clipman-toolbutton`,
        });
        deleteButton.connectObject(`clicked`, () => {
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
        toggleSubMenuButton.connectObject(`clicked`, () => {
            this.menu.toggle();
        });

        const boxLayout = new St.BoxLayout({
            style_class: `clipman-toolbuttonnpanel`,
        });
        boxLayout.add(this._pinButton);
        boxLayout.add(deleteButton);
        boxLayout.add(toggleSubMenuButton);
        this.add_child(boxLayout);

        const clickAction = new Clutter.ClickAction({
            enabled: this._activatable,
        });
        clickAction.connectObject(`clicked`, () => {
            this.activate(Clutter.get_current_event());
        });
        clickAction.connectObject(`notify::pressed`, () => {
            if (clickAction.pressed) {
                this.add_style_pseudo_class(`active`);
            } else {
                this.remove_style_pseudo_class(`active`);
            }
        });
        this.add_action(clickAction);
    }

    get pinned() {
        return this._pinButton.checked;
    }

    set showSurroundingWhitespace(showSurroundingWhitespace) {
        if (showSurroundingWhitespace) {
            const text = GLib.markup_escape_text(this.text, -1).replaceAll(/^\s+|\s+$/g, (match1) => {
                [[/ +/g, `␣`], [/\t+/g, `⇥`], [/\n+/g, `↵`]].forEach(([regExp, str]) => {
                    match1 = match1.replaceAll(regExp, (match2) => {
                        return `<span alpha='35%'>${str.repeat(match2.length)}</span>`;
                    });
                });
                return match1;
            }).replaceAll(/\s+/g, ` `);
            this.label.clutter_text.set_markup(text);
        } else {
            this.label.text = this.text.trim().replaceAll(/\s+/g, ` `);
        }
    }

    set showColorPreview(showColorPreview) {
        if (showColorPreview) {
            // use lazy loadiing for color preview
            if (this._colorPreview === undefined) {
                this._colorPreview = this._generateColorPreview(this.text) ?? null;
                if (this._colorPreview) {
                    this.colorPreviewIcon = new St.Icon({
                        gicon: this._colorPreview,
                        style_class: `clipman-colorpreview`,
                    });
                    this.insert_child_at_index(this.colorPreviewIcon, 1);
                }
            }
            this.colorPreviewIcon?.show();
        } else {
            this.colorPreviewIcon?.hide();
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
                this._pinButton.checked = !this._pinButton.checked;
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

        this._lastUsedId = -1;
        this._lastUsedSortKey = -1;
        this._pinnedCount = 0;

        this._buildIcon();
        this._buildMenu();

        this._preferences = new Preferences();
        this._preferences.previousHistoryKeepingMode = this._preferences.historyKeepingMode;
        this._preferences.connectObject(
            `historySizeChanged`, this._onHistorySizeChanged.bind(this),
            `historyKeepingModeChanged`, this._onHistoryKeepingModeChanged.bind(this)
        );

        this._clipboard = new ClipboardManager();
        this._clipboard.connectObject(`changed`, () => {
            if (!this._privateModeMenuItem.state) {
                this._clipboard.getText().then((text) => {
                    this._onClipboardTextChanged(text);
                });
            }
        });

        this._storage = new Storage();

        this._loadState();
        this._loadHistory();
        this._addKeybindings();
        this._updateUi();
    }

    destroy() {
        this._qrCodeDialog?.close();

        this._removeKeybindings();
        this._saveState();

        this._preferences.destroy();
        this._clipboard.destroy();

        super.destroy();
    }

    _buildIcon() {
        const mainIcon = new St.Icon({
            icon_name: `edit-paste-symbolic`,
            style_class: `system-status-icon`,
        });
        this._privateModeIcon = new St.Icon({
            icon_name: `view-conceal-symbolic`,
            style_class: `system-status-icon`,
            visible: false,
        });
        const boxLayout = new St.BoxLayout();
        boxLayout.add_child(mainIcon);
        boxLayout.add_child(this._privateModeIcon);
        this.add_child(boxLayout);
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
        this._historyMenuSection.section.box.connectObject(
            `actor-added`, (...[, actor]) => {
                if (actor instanceof HistoryMenuItem) {
                    this._updateUi();
                }
            },
            `actor-removed`, (...[, actor]) => {
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
            if (menuItemsToRemove.length > 0) {
                menuItemsToRemove.forEach((menuItem) => {
                    this._destroyMenuItem(menuItem);
                });
                this._saveHistory();
            }
        });

        this._privateModeMenuItem = new PopupMenu.PopupSwitchMenuItem(_(`Private Mode`), false, {
            reactive: true,
        });
        this._privateModeMenuItem._switch.bind_property(
            `state`,
            this._privateModeIcon,
            `visible`,
            GObject.BindingFlags.Default
        );
        this._privateModeMenuItem.connectObject(`toggled`, (...[, state]) => {
            this.menu.close();
            if (!state) {
                this._currentMenuItem?.setOrnament(PopupMenu.Ornament.NONE);
                delete this._currentMenuItem;
                this._clipboard.getText().then((text) => {
                    if (text && text.length > 0) {
                        const menuItems = this._historyMenuSection.section._getMenuItems();
                        const currentMenuItem = menuItems.find((menuItem) => {
                            return menuItem.text === text;
                        });
                        if (currentMenuItem) {
                            currentMenuItem.sortKey = ++this._lastUsedSortKey;
                            if (!currentMenuItem.pinned) {
                                this._historyMenuSection.section.moveMenuItem(currentMenuItem, this._pinnedCount);
                            }
                            currentMenuItem.setOrnament(PopupMenu.Ornament.DOT);
                            this._saveHistory();
                        }
                        this._currentMenuItem = currentMenuItem;
                    }
                });
            }
            this._updateUi();
        });
        this.menu.addMenuItem(this._privateModeMenuItem);

        this.menu.addAction(_(`Settings`, `Open settings`), () => {
            ExtensionUtils.openPrefs();
        });
    }

    _createMenuItem(text, pinned, id = ++this._lastUsedId, sortKey = ++this._lastUsedSortKey) {
        const menuItem = new HistoryMenuItem(text, pinned, this.menu);
        menuItem.id = id;
        menuItem.sortKey = sortKey;
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
        menuItem.connectObject(
            `activate`, () => {
                this.menu.close();
                this._clipboard.setText(menuItem.text);
            },
            `submenuAboutToOpen`, () => {
                // use lazy loadiing for submenu
                if (menuItem.menu.isEmpty()) {
                    this._populateSubMenu(menuItem);
                }
            },
            `pinned`, this._onMenuItemPinned.bind(this),
            `delete`, () => {
                if (this._historyMenuSection.section.numMenuItems === 1) {
                    this.menu.close();
                }
                this._destroyMenuItem(menuItem);
                this._saveHistory();
            },
            `destroy`, () => {
                Gio.Settings.unbind(menuItem, `showColorPreview`);
                Gio.Settings.unbind(menuItem, `showSurroundingWhitespace`);
                if (this._currentMenuItem === menuItem) {
                    delete this._currentMenuItem;
                }
            }
        );

        return menuItem;
    }

    _destroyMenuItem(menuItem) {
        if (this._currentMenuItem === menuItem) {
            this._clipboard.clear();
        }
        if (menuItem.pinned) {
            --this._pinnedCount;
        }
        if (global.stage.key_focus === menuItem) {
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
        if (this._preferences.historyKeepingMode === HistoryKeepingMode.All || (
            this._preferences.historyKeepingMode === HistoryKeepingMode.Pinned && menuItem.pinned
        )) {
            this._storage.deleteEntryContent(menuItem).catch(log);
        }
        menuItem.destroy();
        if (this._historyMenuSection.section.numMenuItems === 0) {
            this._lastUsedId = -1;
            this._lastUsedSortKey = -1;
        }
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
                if (!this._privateModeMenuItem.state) {
                    this._clearMenuItem.activate(Clutter.get_current_event());
                }
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
                    validator: (text) => {
                        return Validator.isURL(text, {
                            protocols: [
                                `feed`,
                                `ftp`,
                                `git`,
                                `gopher`,
                                `http`,
                                `https`,
                                `irc6`,
                                `irc`,
                                `ircs`,
                                `rsync`,
                                `sftp`,
                                `smb`,
                                `ssh`,
                                `telnet`,
                                `vnc`,
                            ],
                            require_protocol: true,
                        });
                    },
                },
                {
                    title: _(`Open`, `Open URL`),
                    validator: (text) => {
                        return Validator.isMagnetURI(text);
                    },
                },
                {
                    title: _(`Open`, `Open URL`),
                    validator: (text) => {
                        return /^tg:\/\/\S+$/i.test(text);
                    },
                },
                {
                    prefix: `mailto:`,
                    regExp: /^mailto:/i,
                    title: _(`Compose an Email`),
                    validator: (text) => {
                        return Validator.isEmail(text);
                    },
                },
                {
                    prefix: `tel:+`,
                    regExp: /^(tel:)?\+/i,
                    title: _(`Make a Call`),
                    validator: (text) => {
                        return Validator.isMobilePhone(text);
                    },
                },
                {
                    title: _(`Make a Call`),
                    validator: (text) => {
                        return /^callto:\S+$/i.test(text);
                    },
                },
            ];

            const trimmedText = menuItem.text.trim();
            for (const action of actions) {
                const capturedText = action.regExp ? trimmedText.replace(action.regExp, ``) : trimmedText;
                if (action.validator(capturedText)) {
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

        menuItem.menu.addAction(_(`Share Online`), () => {
            this.menu.close();
            this._shareOnline(menuItem.text);
        });

        menuItem.menu.addAction(_(`Show QR Code`), () => {
            this.menu.close();
            this._showQrCode(menuItem.text);
        });
    }

    _showQrCode(text) {
        this._qrCodeDialog = new QrCodeDialog(text);
        this._qrCodeDialog.connectObject(`destroy`, () => {
            delete this._qrCodeDialog;
        });
        this._qrCodeDialog.open();
    }

    _launchUri(uri) {
        try {
            Gio.app_info_launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (error) {
            notifyError(_(`Failed to launch URI "%s"`).format(uri), error.message);
        }
    }

    _searchTheWeb(text) {
        const searchEngines = SearchEngines.get(this._preferences);
        const currentEngine = searchEngines.find(this._preferences.webSearchEngine);

        if (!currentEngine) {
            notifyError(_(`Failed to search the web`), _(`Unknown search engine`));
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
                notifyError(_(`Failed to search the web`), _(`Invalid search URL "%s"`).format(currentEngine.url));
                return;
            }
        }

        this._launchUri(currentEngine.url.replace(`%s`, encodeURIComponent(text)));
    }

    _shareOnline(text) {
        const formData = {
            content: text,
            expiry_days: this._preferences.expiryDays.toString(),
        };

        const message = Soup.Message.new(`POST`, `https://dpaste.com/api/v2/`);
        message.set_request_body_from_bytes(
            Soup.FORM_MIME_TYPE_URLENCODED,
            new GLib.Bytes(Soup.form_encode_hash(formData))
        );

        if (!this._soupSession) {
            this._soupSession = new Soup.Session({
                user_agent : Me.uuid,
            });
            if (Soup.get_major_version() < 3) {
                this._soupSession.send_and_read_finish = (message) => {
                    return message.response_body.flatten().get_as_bytes();
                };
            }
        }

        this._soupSession.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                if (!panelIndicator.instance || this._privateModeMenuItem.state) {
                    return;
                }
                try {
                    if (message.status_code !== Soup.Status.CREATED) {
                        throw new Error(message.reason_phrase);
                    }
                    const bytes = session.send_and_read_finish(result);
                    const uri = new TextDecoder().decode(bytes.get_data()).trim();
                    this._clipboard.setText(uri);
                    notify(_(`The text was successfully shared online`), uri, false);
                } catch (error) {
                    notifyError(_(`Failed to share the text online`), error.message);
                }
            }
        );
    }

    _loadHistory() {
        if (this._preferences.historyKeepingMode === HistoryKeepingMode.None) {
            return;
        }

        this._clipboard.blockSignals = true;

        this._storage.loadEntries().then(async (entries) => {
            if (this._preferences.historyKeepingMode === HistoryKeepingMode.Pinned) {
                entries = entries.filter((entry) => {
                    return entry.pinned;
                });
            }

            if (entries.length === 0) {
                return;
            }

            entries.forEach((entry) => {
                this._lastUsedId = Math.max(entry.id, this._lastUsedId);
                this._lastUsedSortKey = Math.max(entry.sortKey, this._lastUsedSortKey);
            });

            this._clipboard.blockSignals = false;

            for (const entry of entries) {
                try {
                    await this._storage.loadEntryContent(entry);
                    if (!entry.text) {
                        continue;
                    }
                    const menuItem = this._createMenuItem(entry.text, entry.pinned, entry.id, entry.sortKey);
                    if (menuItem.pinned) {
                        this._historyMenuSection.section.addMenuItem(menuItem, this._pinnedCount++);
                    } else {
                        this._historyMenuSection.section.addMenuItem(menuItem);
                        if (this._historyMenuSection.section.numMenuItems - this._pinnedCount === this._preferences.historySize) {
                            break;
                        }
                    }
                } catch (error) {
                    log(error);
                }
            }

            this._clipboard.getText().then((text) => {
                if (text && text.length > 0) {
                    const menuItems = this._historyMenuSection.section._getMenuItems();
                    const currentMenuItem = menuItems.find((menuItem) => {
                        return menuItem.text === text;
                    });
                    if (currentMenuItem) {
                        currentMenuItem.sortKey = ++this._lastUsedSortKey;
                        if (!currentMenuItem.pinned) {
                            this._historyMenuSection.section.moveMenuItem(currentMenuItem, this._pinnedCount);
                        }
                        currentMenuItem.setOrnament(PopupMenu.Ornament.DOT);
                        this._saveHistory();
                    }
                    this._currentMenuItem = currentMenuItem;
                }
            });
        }).catch(log).finally(() => {
            this._clipboard.blockSignals = false;
        });
    }

    _saveHistory(force = false) {
        if (this._preferences.historyKeepingMode === HistoryKeepingMode.None) {
            if (force) {
                this._storage.saveEntries([]).catch(log);
            }
            return;
        }

        let menuItems = this._historyMenuSection.section._getMenuItems();
        if (this._preferences.historyKeepingMode === HistoryKeepingMode.Pinned) {
            menuItems = menuItems.filter((menuItem) => {
                return menuItem.pinned;
            });
        }

        this._storage.saveEntries(menuItems).catch(log);
    }

    _loadState() {
        this._privateModeMenuItem.setToggleState(panelIndicator.state.privateMode);
    }

    _saveState() {
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
                currentMenuItem.sortKey = ++this._lastUsedSortKey;
                if (!currentMenuItem.pinned) {
                    this._historyMenuSection.section.moveMenuItem(currentMenuItem, this._pinnedCount);
                }
            } else {
                if (menuItems.length - this._pinnedCount === this._preferences.historySize) {
                    this._destroyMenuItem(menuItems.pop());
                }
                currentMenuItem = this._createMenuItem(text);
                this._historyMenuSection.section.addMenuItem(currentMenuItem, this._pinnedCount);
                if (this._preferences.historyKeepingMode === HistoryKeepingMode.All) {
                    this._storage.saveEntryContent(currentMenuItem).catch(log);
                }
            }
            this._saveHistory();
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
        if (menuItemsToRemove.length > 0) {
            menuItemsToRemove.forEach((menuItem) => {
                this._destroyMenuItem(menuItem);
            });
            this._saveHistory();
        }
    }

    _onHistoryKeepingModeChanged() {
        this._saveHistory(true);

        const menuItems = this._historyMenuSection.section._getMenuItems();
        menuItems.forEach((menuItem) => {
            switch (this._preferences.historyKeepingMode) {
                case HistoryKeepingMode.None: {
                    if (this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.All || (
                        this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.Pinned && menuItem.pinned
                    )) {
                        this._storage.deleteEntryContent(menuItem).catch(log);
                    }
                    break;
                }
                case HistoryKeepingMode.Pinned: {
                    if (menuItem.pinned) {
                        if (this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.None) {
                            this._storage.saveEntryContent(menuItem).catch(log);
                        }
                    } else {
                        if (this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.All) {
                            this._storage.deleteEntryContent(menuItem).catch(log);
                        }
                    }
                    break;
                }
                case HistoryKeepingMode.All: {
                    if (this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.None || (
                        this._preferences.previousHistoryKeepingMode === HistoryKeepingMode.Pinned && !menuItem.pinned
                    )) {
                        this._storage.saveEntryContent(menuItem).catch(log);
                    }
                    break;
                }
                default:
                    break;
            }
        });

        this._preferences.previousHistoryKeepingMode = this._preferences.historyKeepingMode;
    }

    _onMenuItemPinned(menuItem) {
        const menuItems = this._historyMenuSection.section._getMenuItems();
        const currentIndex = menuItems.indexOf(menuItem);
        if (menuItem.pinned) {
            if (currentIndex < this._pinnedCount) {
                return;
            }
            this._historyMenuSection.section.moveMenuItem(menuItem, 0);
            ++this._pinnedCount;
        } else {
            if (currentIndex >= this._pinnedCount) {
                return;
            }
            if (menuItems.length - this._pinnedCount === this._preferences.historySize) {
                const lastMenuItem = menuItems[menuItems.length - 1];
                if (menuItem.sortKey < lastMenuItem.sortKey) {
                    this._destroyMenuItem(menuItem);
                    this._saveHistory();
                    return;
                }
                this._destroyMenuItem(lastMenuItem);
            }
            let indexToMove = menuItems.length;
            for (let i = this._pinnedCount; i < menuItems.length; ++i) {
                if (menuItems[i].sortKey < menuItem.sortKey) {
                    indexToMove = i;
                    break;
                }
            }
            this._historyMenuSection.section.moveMenuItem(menuItem, indexToMove - 1);
            --this._pinnedCount;
        }

        this._saveHistory();

        if (this._preferences.historyKeepingMode === HistoryKeepingMode.Pinned) {
            if (menuItem.pinned) {
                this._storage.saveEntryContent(menuItem).catch(log);
            } else {
                this._storage.deleteEntryContent(menuItem).catch(log);
            }
        }

        this._updateUi();
    }

    _onOpenStateChanged(...[, open]) {
        if (open) {
            this.add_style_pseudo_class(`active`);

            this._historyMenuSection.scrollView.vscroll.adjustment.value = 0;
            this._historyMenuSection.entry.text = ``;
            Promise.resolve().then(() => {
                global.stage.set_key_focus(this._historyMenuSection.entry);
            });

            const workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            const scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const margin = this.menu.actor.get_margin();
            const minAvailableSize = Math.min(
                (workArea.width - margin.left - margin.right) / scaleFactor,
                (workArea.height - margin.top - margin.bottom) / scaleFactor,
            );

            const [menuMaxWidthRatio, menuMaxHeightRatio] = [
                [0.47, 0.6, 0.72],
                [0.55, 0.7, 0.85],
            ];
            const [menuMaxWidth, menuMaxHeight] = [
                Math.round(minAvailableSize * menuMaxWidthRatio[this._preferences.menuMaxSize]),
                Math.round(minAvailableSize * menuMaxHeightRatio[this._preferences.menuMaxSize]),
            ];
            this.menu.actor.style = `max-width: ${menuMaxWidth}px; max-height: ${menuMaxHeight}px;`;

            const entryMinWidth = Math.min(300, Math.round(menuMaxWidth * 0.75));
            this._historyMenuSection.entry.style = `min-width: ${entryMinWidth}px;`;
        } else {
            this.remove_style_pseudo_class(`active`);
        }
    }
});

const panelIndicator = {
    instance: null,
    state: {
        privateMode: false
    }
};

function notify(text, details, transient = true) {
    const source = new MessageTray.SystemNotificationSource();
    Main.messageTray.add(source);

    const notification = new MessageTray.Notification(source, text, details);
    notification.setTransient(transient);
    source.showNotification(notification);
};

function notifyError(error, details, transient) {
    log(error);
    notify(error, details, transient);
};

function init() {
    SignalTracker.registerDestroyableType(ClipboardManager);
    SignalTracker.registerDestroyableType(Preferences);

    ExtensionUtils.initTranslations(Me.uuid);
}

function enable() {
    panelIndicator.instance = new PanelIndicator();
    Main.panel.addToStatusArea(`${Me.metadata.name}`, panelIndicator.instance);
}

function disable() {
    panelIndicator.instance.destroy();
    delete panelIndicator.instance;
}
