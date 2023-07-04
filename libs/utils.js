'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var _ = function(text, context) {
    return context ? ExtensionUtils.pgettext(context, text) : ExtensionUtils.gettext(text);
};

var log = function(text) {
    console.log(`${Me.uuid}: ${text}`);
};
