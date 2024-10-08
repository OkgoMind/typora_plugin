class abcPlugin extends BaseCustomPlugin {
    init = () => this.ABCJS = null;

    callback = anchorNode => this.utils.insertText(anchorNode, this.config.TEMPLATE);

    process = () => {
        this.utils.thirdPartyDiagramParser.register({
            lang: this.config.LANGUAGE,
            mappingLang: this.config.LANGUAGE,
            destroyWhenUpdate: false,
            interactiveMode: this.config.INTERACTIVE_MODE,
            checkSelector: ".plugin-notation-content",
            wrapElement: '<div class="plugin-notation-content"></div>',
            css: {
                height: this.config.DEFAULT_FENCE_HEIGHT,
                "background-color": this.config.DEFAULT_FENCE_BACKGROUND_COLOR
            },
            lazyLoadFunc: this.lazyLoad,
            createFunc: this.create,
            updateFunc: null,
            destroyFunc: null,
            beforeExport: null,
            extraStyleGetter: null,
            versionGetter: this.versionGetter,
        })
    }

    create = ($wrap, content) => {
        const visualOptions = Object.assign({}, this.config.VISUAL_OPTIONS); // set prototype
        this.ABCJS.renderAbc($wrap[0], content, visualOptions);
    }

    versionGetter = () => this.ABCJS && this.ABCJS.signature

    lazyLoad = () => this.ABCJS = require("./abcjs-basic-min");
}

module.exports = {
    plugin: abcPlugin
};