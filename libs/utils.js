'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var _ = function(text, context) {
    return context ? ExtensionUtils.pgettext(context, text) : ExtensionUtils.gettext(text);
};

var log = function(text) {
    console.log(`${Me.uuid}: ${text}`);
};

const knownColors = new Map();

var ColorParser = {
    parse(color) {
        if (!color) {
            return null;
        }

        color = color.trim().toLowerCase();

        if (knownColors.size === 0) {
            // https://htmlcolorcodes.com/color-names/
            knownColors.set(`aliceblue`,            [240, 248, 255]);
            knownColors.set(`antiquewhite`,         [250, 235, 215]);
            knownColors.set(`aqua`,                 [0, 255, 255]);
            knownColors.set(`aquamarine`,           [127, 255, 212]);
            knownColors.set(`azure`,                [240, 255, 255]);
            knownColors.set(`beige`,                [245, 245, 220]);
            knownColors.set(`bisque`,               [255, 228, 196]);
            knownColors.set(`black`,                [0, 0, 0]);
            knownColors.set(`blanchedalmond`,       [255, 235, 205]);
            knownColors.set(`blue`,                 [0, 0, 255]);
            knownColors.set(`blueviolet`,           [138, 43, 226]);
            knownColors.set(`brown`,                [165, 42, 42]);
            knownColors.set(`burlywood`,            [222, 184, 135]);
            knownColors.set(`cadetblue`,            [95, 158, 160]);
            knownColors.set(`chartreuse`,           [127, 255, 0]);
            knownColors.set(`chocolate`,            [210, 105, 30]);
            knownColors.set(`coral`,                [255, 127, 80]);
            knownColors.set(`cornflowerblue`,       [100, 149, 237]);
            knownColors.set(`cornsilk`,             [255, 248, 220]);
            knownColors.set(`crimson`,              [220, 20, 60]);
            knownColors.set(`cyan`,                 [0, 255, 255]);
            knownColors.set(`darkblue`,             [0, 0, 139]);
            knownColors.set(`darkcyan`,             [0, 139, 139]);
            knownColors.set(`darkgoldenrod`,        [184, 134, 11]);
            knownColors.set(`darkgray`,             [169, 169, 169]);
            knownColors.set(`darkgreen`,            [0, 100, 0]);
            knownColors.set(`darkgrey`,             [169, 169, 169]);
            knownColors.set(`darkkhaki`,            [189, 183, 107]);
            knownColors.set(`darkmagenta`,          [139, 0, 139]);
            knownColors.set(`darkolivegreen`,       [85, 107, 47]);
            knownColors.set(`darkorange`,           [255, 140, 0]);
            knownColors.set(`darkorchid`,           [153, 50, 204]);
            knownColors.set(`darkred`,              [139, 0, 0]);
            knownColors.set(`darksalmon`,           [233, 150, 122]);
            knownColors.set(`darkseagreen`,         [143, 188, 139]);
            knownColors.set(`darkslateblue`,        [72, 61, 139]);
            knownColors.set(`darkslategray`,        [47, 79, 79]);
            knownColors.set(`darkslategrey`,        [47, 79, 79]);
            knownColors.set(`darkturquoise`,        [0, 206, 209]);
            knownColors.set(`darkviolet`,           [148, 0, 211]);
            knownColors.set(`deeppink`,             [255, 20, 147]);
            knownColors.set(`deepskyblue`,          [0, 191, 255]);
            knownColors.set(`dimgray`,              [105, 105, 105]);
            knownColors.set(`dimgrey`,              [105, 105, 105]);
            knownColors.set(`dodgerblue`,           [30, 144, 255]);
            knownColors.set(`firebrick`,            [178, 34, 34]);
            knownColors.set(`floralwhite`,          [255, 250, 240]);
            knownColors.set(`forestgreen`,          [34, 139, 34]);
            knownColors.set(`fuchsia`,              [255, 0, 255]);
            knownColors.set(`gainsboro`,            [220, 220, 220]);
            knownColors.set(`ghostwhite`,           [248, 248, 255]);
            knownColors.set(`gold`,                 [255, 215, 0]);
            knownColors.set(`goldenrod`,            [218, 165, 32]);
            knownColors.set(`gray`,                 [128, 128, 128]);
            knownColors.set(`green`,                [0, 128, 0]);
            knownColors.set(`greenyellow`,          [173, 255, 47]);
            knownColors.set(`grey`,                 [128, 128, 128]);
            knownColors.set(`honeydew`,             [240, 255, 240]);
            knownColors.set(`hotpink`,              [255, 105, 180]);
            knownColors.set(`indianred`,            [205, 92, 92]);
            knownColors.set(`indigo`,               [75, 0, 130]);
            knownColors.set(`ivory`,                [255, 255, 240]);
            knownColors.set(`khaki`,                [240, 230, 140]);
            knownColors.set(`lavender`,             [230, 230, 250]);
            knownColors.set(`lavenderblush`,        [255, 240, 245]);
            knownColors.set(`lawngreen`,            [124, 252, 0]);
            knownColors.set(`lemonchiffon`,         [255, 250, 205]);
            knownColors.set(`lightblue`,            [173, 216, 230]);
            knownColors.set(`lightcoral`,           [240, 128, 128]);
            knownColors.set(`lightcyan`,            [224, 255, 255]);
            knownColors.set(`lightgoldenrodyellow`, [250, 250, 210]);
            knownColors.set(`lightgray`,            [211, 211, 211]);
            knownColors.set(`lightgreen`,           [144, 238, 144]);
            knownColors.set(`lightgrey`,            [211, 211, 211]);
            knownColors.set(`lightpink`,            [255, 182, 193]);
            knownColors.set(`lightsalmon`,          [255, 160, 122]);
            knownColors.set(`lightseagreen`,        [32, 178, 170]);
            knownColors.set(`lightskyblue`,         [135, 206, 250]);
            knownColors.set(`lightslategray`,       [119, 136, 153]);
            knownColors.set(`lightslategrey`,       [119, 136, 153]);
            knownColors.set(`lightsteelblue`,       [176, 196, 222]);
            knownColors.set(`lightyellow`,          [255, 255, 224]);
            knownColors.set(`lime`,                 [0, 255, 0]);
            knownColors.set(`limegreen`,            [50, 205, 50]);
            knownColors.set(`linen`,                [250, 240, 230]);
            knownColors.set(`magenta`,              [255, 0, 255]);
            knownColors.set(`maroon`,               [128, 0, 0]);
            knownColors.set(`mediumaquamarine`,     [102, 205, 170]);
            knownColors.set(`mediumblue`,           [0, 0, 205]);
            knownColors.set(`mediumorchid`,         [186, 85, 211]);
            knownColors.set(`mediumpurple`,         [147, 112, 219]);
            knownColors.set(`mediumseagreen`,       [60, 179, 113]);
            knownColors.set(`mediumslateblue`,      [123, 104, 238]);
            knownColors.set(`mediumspringgreen`,    [0, 250, 154]);
            knownColors.set(`mediumturquoise`,      [72, 209, 204]);
            knownColors.set(`mediumvioletred`,      [199, 21, 133]);
            knownColors.set(`midnightblue`,         [25, 25, 112]);
            knownColors.set(`mintcream`,            [245, 255, 250]);
            knownColors.set(`mistyrose`,            [255, 228, 225]);
            knownColors.set(`moccasin`,             [255, 228, 181]);
            knownColors.set(`navajowhite`,          [255, 222, 173]);
            knownColors.set(`navy`,                 [0, 0, 128]);
            knownColors.set(`oldlace`,              [253, 245, 230]);
            knownColors.set(`olive`,                [128, 128, 0]);
            knownColors.set(`olivedrab`,            [107, 142, 35]);
            knownColors.set(`orange`,               [255, 165, 0]);
            knownColors.set(`orangered`,            [255, 69, 0]);
            knownColors.set(`orchid`,               [218, 112, 214]);
            knownColors.set(`palegoldenrod`,        [238, 232, 170]);
            knownColors.set(`palegreen`,            [152, 251, 152]);
            knownColors.set(`paleturquoise`,        [175, 238, 238]);
            knownColors.set(`palevioletred`,        [219, 112, 147]);
            knownColors.set(`papayawhip`,           [255, 239, 213]);
            knownColors.set(`peachpuff`,            [255, 218, 185]);
            knownColors.set(`peru`,                 [205, 133, 63]);
            knownColors.set(`pink`,                 [255, 192, 203]);
            knownColors.set(`plum`,                 [221, 160, 221]);
            knownColors.set(`powderblue`,           [176, 224, 230]);
            knownColors.set(`purple`,               [128, 0, 128]);
            knownColors.set(`rebeccapurple`,        [102, 51, 153]);
            knownColors.set(`red`,                  [255, 0, 0]);
            knownColors.set(`rosybrown`,            [188, 143, 143]);
            knownColors.set(`royalblue`,            [65, 105, 225]);
            knownColors.set(`saddlebrown`,          [139, 69, 19]);
            knownColors.set(`salmon`,               [250, 128, 114]);
            knownColors.set(`sandybrown`,           [244, 164, 96]);
            knownColors.set(`seagreen`,             [46, 139, 87]);
            knownColors.set(`seashell`,             [255, 245, 238]);
            knownColors.set(`sienna`,               [160, 82, 45]);
            knownColors.set(`silver`,               [192, 192, 192]);
            knownColors.set(`skyblue`,              [135, 206, 235]);
            knownColors.set(`slateblue`,            [106, 90, 205]);
            knownColors.set(`slategray`,            [112, 128, 144]);
            knownColors.set(`slategrey`,            [112, 128, 144]);
            knownColors.set(`snow`,                 [255, 250, 250]);
            knownColors.set(`springgreen`,          [0, 255, 127]);
            knownColors.set(`steelblue`,            [70, 130, 180]);
            knownColors.set(`tan`,                  [210, 180, 140]);
            knownColors.set(`teal`,                 [0, 128, 128]);
            knownColors.set(`thistle`,              [216, 191, 216]);
            knownColors.set(`tomato`,               [255, 99, 71]);
            knownColors.set(`turquoise`,            [64, 224, 208]);
            knownColors.set(`violet`,               [238, 130, 238]);
            knownColors.set(`wheat`,                [245, 222, 179]);
            knownColors.set(`white`,                [255, 255, 255]);
            knownColors.set(`whitesmoke`,           [245, 245, 245]);
            knownColors.set(`yellow`,               [255, 255, 0]);
            knownColors.set(`yellowgreen`,          [154, 205, 50]);
        }

        let rgba = knownColors.get(color);
        if (rgba) {
            return rgba;
        }

        const rgbColorRegExp = /^rgba?\((\d{1,3})(?:,\s*|\s+)(\d{1,3})(?:,\s*|\s+)(\d{1,3})(?:(?:,\s*|\s+)(\d{1,3}))?\)$/;
        const rgbColorMatch = color.match(rgbColorRegExp);
        if (rgbColorMatch) {
            return rgbColorMatch.slice(1, 5); // RGBA
        }

        const hexColorRegExp = /^#((?:[\da-f]{3}){1,2}|(?:[\da-f]{4}){1,2})$/;
        const hexColorMatch = color.match(hexColorRegExp);
        if (hexColorMatch) {
            const hexColor = hexColorMatch[1];
            switch (hexColor.length) {
                case 3:
                case 4: {
                    rgba = [
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
                    rgba = [
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
    get(preferences) {
        // use lazy loading to ensure that translations are initialized
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
        searchEngines.find = (engineName) => {
            return Object.getPrototypeOf(searchEngines).find.call(searchEngines, (engine) => {
                return engine.name === engineName;
            });
        };
        searchEngines.findIndex = (engineName) => {
            return Object.getPrototypeOf(searchEngines).findIndex.call(searchEngines, (engine) => {
                return engine.name === engineName;
            });
        };
        searchEngines.sort = () => {
            Object.getPrototypeOf(searchEngines).sort.call(searchEngines, (engine1, engine2) => {
                if (engine1.name === `custom`) {
                    return 1;
                }
                if (engine2.name === `custom`) {
                    return -1;
                }
                return engine1.title.localeCompare(engine2.title);
            });
        };

        return searchEngines;
    },
};
