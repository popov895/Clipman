'use strict';

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const { _ } = Me.imports.libs.utils;

const searchEngines = [];

var get = function(preferences) {
    if (searchEngines.length === 0) {
        searchEngines.push(
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

    return [
        ...searchEngines,
        {
             name: `custom`,
            title: _(`Other`, `Other search engine`),
              url: preferences.customWebSearchUrl
        },
    ];
};
