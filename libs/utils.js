'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var _ = function(text, context) {
    return context ? ExtensionUtils.pgettext(context, text) : ExtensionUtils.gettext(text);
};

var log = function(text) {
    console.log(`${Me.uuid}: ${text}`);
};

// https://htmlcolorcodes.com/color-names/
const knownColors = [
    { name: `aliceblue`,            value: [240, 248, 255] },
    { name: `antiquewhite`,         value: [250, 235, 215] },
    { name: `aqua`,                 value: [0, 255, 255] },
    { name: `aquamarine`,           value: [127, 255, 212] },
    { name: `azure`,                value: [240, 255, 255] },
    { name: `beige`,                value: [245, 245, 220] },
    { name: `bisque`,               value: [255, 228, 196] },
    { name: `black`,                value: [0, 0, 0] },
    { name: `blanchedalmond`,       value: [255, 235, 205] },
    { name: `blue`,                 value: [0, 0, 255] },
    { name: `blueviolet`,           value: [138, 43, 226] },
    { name: `brown`,                value: [165, 42, 42] },
    { name: `burlywood`,            value: [222, 184, 135] },
    { name: `cadetblue`,            value: [95, 158, 160] },
    { name: `chartreuse`,           value: [127, 255, 0] },
    { name: `chocolate`,            value: [210, 105, 30] },
    { name: `coral`,                value: [255, 127, 80] },
    { name: `cornflowerblue`,       value: [100, 149, 237] },
    { name: `cornsilk`,             value: [255, 248, 220] },
    { name: `crimson`,              value: [220, 20, 60] },
    { name: `cyan`,                 value: [0, 255, 255] },
    { name: `darkblue`,             value: [0, 0, 139] },
    { name: `darkcyan`,             value: [0, 139, 139] },
    { name: `darkgoldenrod`,        value: [184, 134, 11] },
    { name: `darkgray`,             value: [169, 169, 169] },
    { name: `darkgreen`,            value: [0, 100, 0] },
    { name: `darkgrey`,             value: [169, 169, 169] },
    { name: `darkkhaki`,            value: [189, 183, 107] },
    { name: `darkmagenta`,          value: [139, 0, 139] },
    { name: `darkolivegreen`,       value: [85, 107, 47] },
    { name: `darkorange`,           value: [255, 140, 0] },
    { name: `darkorchid`,           value: [153, 50, 204] },
    { name: `darkred`,              value: [139, 0, 0] },
    { name: `darksalmon`,           value: [233, 150, 122] },
    { name: `darkseagreen`,         value: [143, 188, 139] },
    { name: `darkslateblue`,        value: [72, 61, 139] },
    { name: `darkslategray`,        value: [47, 79, 79] },
    { name: `darkslategrey`,        value: [47, 79, 79] },
    { name: `darkturquoise`,        value: [0, 206, 209] },
    { name: `darkviolet`,           value: [148, 0, 211] },
    { name: `deeppink`,             value: [255, 20, 147] },
    { name: `deepskyblue`,          value: [0, 191, 255] },
    { name: `dimgray`,              value: [105, 105, 105] },
    { name: `dimgrey`,              value: [105, 105, 105] },
    { name: `dodgerblue`,           value: [30, 144, 255] },
    { name: `firebrick`,            value: [178, 34, 34] },
    { name: `floralwhite`,          value: [255, 250, 240] },
    { name: `forestgreen`,          value: [34, 139, 34] },
    { name: `fuchsia`,              value: [255, 0, 255] },
    { name: `gainsboro`,            value: [220, 220, 220] },
    { name: `ghostwhite`,           value: [248, 248, 255] },
    { name: `gold`,                 value: [255, 215, 0] },
    { name: `goldenrod`,            value: [218, 165, 32] },
    { name: `gray`,                 value: [128, 128, 128] },
    { name: `green`,                value: [0, 128, 0] },
    { name: `greenyellow`,          value: [173, 255, 47] },
    { name: `grey`,                 value: [128, 128, 128] },
    { name: `honeydew`,             value: [240, 255, 240] },
    { name: `hotpink`,              value: [255, 105, 180] },
    { name: `indianred`,            value: [205, 92, 92] },
    { name: `indigo`,               value: [75, 0, 130] },
    { name: `ivory`,                value: [255, 255, 240] },
    { name: `khaki`,                value: [240, 230, 140] },
    { name: `lavender`,             value: [230, 230, 250] },
    { name: `lavenderblush`,        value: [255, 240, 245] },
    { name: `lawngreen`,            value: [124, 252, 0] },
    { name: `lemonchiffon`,         value: [255, 250, 205] },
    { name: `lightblue`,            value: [173, 216, 230] },
    { name: `lightcoral`,           value: [240, 128, 128] },
    { name: `lightcyan`,            value: [224, 255, 255] },
    { name: `lightgoldenrodyellow`, value: [250, 250, 210] },
    { name: `lightgray`,            value: [211, 211, 211] },
    { name: `lightgreen`,           value: [144, 238, 144] },
    { name: `lightgrey`,            value: [211, 211, 211] },
    { name: `lightpink`,            value: [255, 182, 193] },
    { name: `lightsalmon`,          value: [255, 160, 122] },
    { name: `lightseagreen`,        value: [32, 178, 170] },
    { name: `lightskyblue`,         value: [135, 206, 250] },
    { name: `lightslategray`,       value: [119, 136, 153] },
    { name: `lightslategrey`,       value: [119, 136, 153] },
    { name: `lightsteelblue`,       value: [176, 196, 222] },
    { name: `lightyellow`,          value: [255, 255, 224] },
    { name: `lime`,                 value: [0, 255, 0] },
    { name: `limegreen`,            value: [50, 205, 50] },
    { name: `linen`,                value: [250, 240, 230] },
    { name: `magenta`,              value: [255, 0, 255] },
    { name: `maroon`,               value: [128, 0, 0] },
    { name: `mediumaquamarine`,     value: [102, 205, 170] },
    { name: `mediumblue`,           value: [0, 0, 205] },
    { name: `mediumorchid`,         value: [186, 85, 211] },
    { name: `mediumpurple`,         value: [147, 112, 219] },
    { name: `mediumseagreen`,       value: [60, 179, 113] },
    { name: `mediumslateblue`,      value: [123, 104, 238] },
    { name: `mediumspringgreen`,    value: [0, 250, 154] },
    { name: `mediumturquoise`,      value: [72, 209, 204] },
    { name: `mediumvioletred`,      value: [199, 21, 133] },
    { name: `midnightblue`,         value: [25, 25, 112] },
    { name: `mintcream`,            value: [245, 255, 250] },
    { name: `mistyrose`,            value: [255, 228, 225] },
    { name: `moccasin`,             value: [255, 228, 181] },
    { name: `navajowhite`,          value: [255, 222, 173] },
    { name: `navy`,                 value: [0, 0, 128] },
    { name: `oldlace`,              value: [253, 245, 230] },
    { name: `olive`,                value: [128, 128, 0] },
    { name: `olivedrab`,            value: [107, 142, 35] },
    { name: `orange`,               value: [255, 165, 0] },
    { name: `orangered`,            value: [255, 69, 0] },
    { name: `orchid`,               value: [218, 112, 214] },
    { name: `palegoldenrod`,        value: [238, 232, 170] },
    { name: `palegreen`,            value: [152, 251, 152] },
    { name: `paleturquoise`,        value: [175, 238, 238] },
    { name: `palevioletred`,        value: [219, 112, 147] },
    { name: `papayawhip`,           value: [255, 239, 213] },
    { name: `peachpuff`,            value: [255, 218, 185] },
    { name: `peru`,                 value: [205, 133, 63] },
    { name: `pink`,                 value: [255, 192, 203] },
    { name: `plum`,                 value: [221, 160, 221] },
    { name: `powderblue`,           value: [176, 224, 230] },
    { name: `purple`,               value: [128, 0, 128] },
    { name: `rebeccapurple`,        value: [102, 51, 153] },
    { name: `red`,                  value: [255, 0, 0] },
    { name: `rosybrown`,            value: [188, 143, 143] },
    { name: `royalblue`,            value: [65, 105, 225] },
    { name: `saddlebrown`,          value: [139, 69, 19] },
    { name: `salmon`,               value: [250, 128, 114] },
    { name: `sandybrown`,           value: [244, 164, 96] },
    { name: `seagreen`,             value: [46, 139, 87] },
    { name: `seashell`,             value: [255, 245, 238] },
    { name: `sienna`,               value: [160, 82, 45] },
    { name: `silver`,               value: [192, 192, 192] },
    { name: `skyblue`,              value: [135, 206, 235] },
    { name: `slateblue`,            value: [106, 90, 205] },
    { name: `slategray`,            value: [112, 128, 144] },
    { name: `slategrey`,            value: [112, 128, 144] },
    { name: `snow`,                 value: [255, 250, 250] },
    { name: `springgreen`,          value: [0, 255, 127] },
    { name: `steelblue`,            value: [70, 130, 180] },
    { name: `tan`,                  value: [210, 180, 140] },
    { name: `teal`,                 value: [0, 128, 128] },
    { name: `thistle`,              value: [216, 191, 216] },
    { name: `tomato`,               value: [255, 99, 71] },
    { name: `turquoise`,            value: [64, 224, 208] },
    { name: `violet`,               value: [238, 130, 238] },
    { name: `wheat`,                value: [245, 222, 179] },
    { name: `white`,                value: [255, 255, 255] },
    { name: `whitesmoke`,           value: [245, 245, 245] },
    { name: `yellow`,               value: [255, 255, 0] },
    { name: `yellowgreen`,          value: [154, 205, 50] },
];

var ColorParser = {
    parse(color) {
        if (!color) {
            return null;
        }

        color = color.trim().toLowerCase();

        const matchedKnownColor = knownColors.find((knownColor) => {
            return knownColor.name === color;
        });
        if (matchedKnownColor) {
            return matchedKnownColor.value;
        }

        const rgbColorRegExp = /^rgba?\((\d{1,3})(?:,\s*|\s+)(\d{1,3})(?:,\s*|\s+)(\d{1,3})(?:(?:,\s*|\s+)(\d{1,3}))?\)$/;
        const rgbColorMatches = rgbColorRegExp.exec(color);
        if (rgbColorMatches) {
            return rgbColorMatches.slice(1, 5); // RGBA
        }

        const hexColorRegExp = /^#((?:[\da-f]{3}){1,2}|(?:[\da-f]{4}){1,2})$/;
        const hexColorMatches = hexColorRegExp.exec(color);
        if (hexColorMatches) {
            const hexColor = hexColorMatches[1];
            switch (hexColor.length) {
                case 3:
                case 4: {
                    const rgba = [
                        parseInt(hexColor[0] + hexColor[0], 16),
                        parseInt(hexColor[1] + hexColor[1], 16),
                        parseInt(hexColor[2] + hexColor[2], 16),
                    ];
                    if (hexColor.length === 4) {
                        rgba.push(parseInt(hexColor[3] + hexColor[3], 16));
                    }
                    return rgba;
                }
                case 6:
                case 8: {
                    const rgba = [
                        parseInt(hexColor.slice(0, 2), 16),
                        parseInt(hexColor.slice(2, 4), 16),
                        parseInt(hexColor.slice(4, 6), 16),
                    ];
                    if (hexColor.length === 8) {
                        rgba.push(parseInt(hexColor.slice(6, 8), 16));
                    }
                    return rgba;
                }
                default:
                    break;
            }
        }

        return null;
    },
};

const predefinedSearchEngines = [];

var SearchEngines = {
    get: function(preferences) {
        if (predefinedSearchEngines.length === 0) {
            predefinedSearchEngines.push(
                { name: `duckduckgo`, title: _(`DuckDuckGo`),                     url: `https://duckduckgo.com/?q=%s` },
                { name: `brave`,      title: _(`Brave`, `Brave search engine`),   url: `https://search.brave.com/search?q=%s` },
                { name: `google`,     title: _(`Google`),                         url: `https://www.google.com/search?q=%s` },
                { name: `bing`,       title: _(`Bing`),                           url: `https://www.bing.com/search?q=%s` },
                { name: `baidu`,      title: _(`Baidu`, `Baidu search engine`),   url: `https://www.baidu.com/s?wd=%s` },
                { name: `yahoo`,      title: _(`Yahoo`),                          url: `https://search.yahoo.com/search?p=%s` },
                { name: `ecosia`,     title: _(`Ecosia`, `Ecosia search engine`), url: `https://www.ecosia.org/search?q=%s` },
                { name: `ask`,        title: _(`Ask`, `Ask.com search engine`),   url: `https://www.ask.com/web?q=%s` },
                { name: `aol`,        title: _(`AOL`, `AOL search engine`),       url: `https://search.aol.com/aol/search?q=%s` },
                { name: `naver`,      title: _(`Naver`, `Naver search engine`),   url: `https://search.naver.com/search.naver?query=%s` },
            );
        }

        const searchEngines = [
            ...predefinedSearchEngines,
            {
                name: `custom`,
                title: _(`Other`, `Other search engine`),
                url: preferences.customWebSearchUrl,
            },
        ];
        searchEngines.find = function(engineName) {
            return Object.getPrototypeOf(this).find.call(this, (engine) => {
                return engine.name === engineName;
            });
        }.bind(searchEngines);
        searchEngines.findIndex = function(engineName) {
            return Object.getPrototypeOf(this).findIndex.call(this, (engine) => {
                return engine.name === engineName;
            });
        }.bind(searchEngines);
        searchEngines.sort = function() {
            Object.getPrototypeOf(this).sort.call(this, (engine1, engine2) => {
                if (engine1.name === `custom`) {
                    return 1;
                }
                if (engine2.name === `custom`) {
                    return -1;
                }
                return engine1.title.localeCompare(engine2.title);
            });
        }.bind(searchEngines);

        return searchEngines;
    }
};
