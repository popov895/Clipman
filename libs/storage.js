'use strict';

const { Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var Storage = class {
    constructor() {
        this._stateDir = Gio.File.new_for_path(GLib.build_filenamev([
            GLib.get_user_state_dir(),
            Me.uuid,
        ]));
        this._storageFile = this._stateDir.get_child(`storage.json`);
    }

    loadEntries() {
        if (!this._storageFile.query_exists(null)) {
            return Promise.resolve([]);
        }
        return new Promise(async (resolve, reject) => {
            try {
                const entries = JSON.parse(await this._loadFile(this._storageFile));
                resolve(entries);
            } catch (error) {
                reject(new Error(`Failed to load storage. ${error.message}`));
            }
        });
    }

    saveEntries(entries) {
        return new Promise(async (resolve, reject) => {
            try {
                const text = JSON.stringify(entries, [`pinned`, `id`, `sortKey`], 2);
                await this._saveFile(this._storageFile, text);
                resolve();
            } catch (error) {
                reject(new Error(`Failed to save storage. ${error.message}`));
            }
        });
    }

    loadEntryContent(entry) {
        return new Promise(async (resolve, reject) => {
            const file = this._stateDir.get_child(entry.id.toString());
            try {
                entry.text = await this._loadFile(file);
                resolve();
            } catch (error) {
                reject(new Error(`Failed to load entry content ${entry.id}. ${error.message}`));
            }
        });
    }

    saveEntryContent(entry) {
        return new Promise(async (resolve, reject) => {
            const file = this._stateDir.get_child(entry.id.toString());
            try {
                await this._saveFile(file, entry.text);
                resolve();
            } catch (error) {
                reject(new Error(`Failed to save entry content ${entry.id}. ${error.message}`));
            }
        });
    }

    deleteEntryContent(entry) {
        const file = this._stateDir.get_child(entry.id.toString());
        if (!file.query_exists(null)) {
            return Promise.resolve();
        }
        return new Promise(async (resolve, reject) => {
            file.delete_async(GLib.PRIORITY_DEFAULT, null, (...[, result]) => {
                try {
                    if (!file.delete_finish(result)) {
                        throw new Error(`Uknnown error`);
                    }
                    resolve();
                } catch (error) {
                    reject(new Error(`Failed to delete entry content ${entry.id}. ${error.message}`));
                }
            });
        });
    }

    _loadFile(file) {
        return new Promise((resolve, reject) => {
            file.load_contents_async(null, (...[, result]) => {
                try {
                    const [ok, bytes] = file.load_contents_finish(result);
                    if (!ok) {
                        throw new Error(`Uknnown error`);
                    }
                    const text = new TextDecoder().decode(bytes);
                    resolve(text);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    _saveFile(file, content) {
        return new Promise(async (resolve, reject) => {
            const parentDir = file.get_parent();
            try {
                if (!parentDir.query_exists(null) && !parentDir.make_directory_with_parents(null)) {
                    throw new Error(`Failed to create parent directory`);
                }
                await new Promise((resolve, reject) => {
                    file.replace_contents_bytes_async(
                        new GLib.Bytes(content),
                        null,
                        false,
                        Gio.FileCreateFlags.REPLACE_DESTINATION,
                        null,
                        (...[, result]) => {
                            try {
                                const [ok] = file.replace_contents_finish(result);
                                if (!ok) {
                                    throw new Error(`Uknnown error`);
                                }
                                resolve();
                            } catch (error) {
                                reject(error);
                            }
                        }
                    );
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }
};
