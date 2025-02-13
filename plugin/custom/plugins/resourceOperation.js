/**
 * 难点在于如何才能匹配到正确的 markdown 图片
 * 1. 不可使用惰性匹配，否则 ![name](assets/image(1).png) 会匹配成 ![name](assets/image(1)  要使用贪婪匹配，然后使用)从后往前截断，逐个测试
 *    1. 比如内容为：![name](assets/image(1).png)123)456
 *    2. 首先贪婪匹配成 ![name](assets/image(1).png)123)，检测文件 assets/image(1).png)123 是否存在
 *    3. 若不存在，往前截断，得到 ![name](assets/image(1).png)，检测文件 assets/image(1).png 是否存在，以此类推
 * 2. 使用贪婪匹配会引入一个问题：一行最多只会匹配一个图片，之后的所有图片都会漏掉
 *    1. 比如有两个图片放在同一行，输入串为： ![name1](./assets/test.png)![name2](./assets/test2.png)123
 *    2. 贪婪匹配到：![name1](./assets/test.png)![name2](./assets/test2.png)，检测文件 ./assets/test.png)![name2](./assets/test2.png 是否存在，发现不存在
 *    3. 接着匹配到：![name1](./assets/test.png)，检测文件./assets/test.png 是否存在，发现存在，返回
 *    4. 上述流程就导致遗漏了 ./assets/test2.png
 *    5. 解决方案：当匹配到![name1](./assets/test.png)后，将后续的内容 )![name2](./assets/test2.png) 作为输入串回到第一步递归处理
 */
class resourceOperationPlugin extends BaseCustomPlugin {
    selector = () => this.utils.getMountFolder() ? undefined : this.utils.nonExistSelector

    hint = isDisable => isDisable && "空白页不可使用此插件"

    styleTemplate = () => true

    hotkey = () => [this.config.hotkey]

    html = () => `
        <div id="plugin-resource-operation" class="plugin-common-modal plugin-common-hidden">
            <div class="plugin-resource-operation-icon-group">
                <div class="plugin-resource-operation-icon ion-close" action="close" ty-hint="关闭"></div>
                <div class="plugin-resource-operation-icon ion-arrow-move" action="move" ty-hint="移动"></div>
                <div class="plugin-resource-operation-icon ion-eye-disabled" action="togglePreview" ty-hint="预览图片"></div>
                <div class="plugin-resource-operation-icon ion-archive" action="download" ty-hint="下载报告"></div>
            </div>
            <img class="plugin-resource-operation-popup plugin-common-hidden">
            <div class="plugin-resource-operation-wrap"></div>
        </div>
    `

    init = () => {
        const { ignore_img_html_element, resource_suffix, markdown_suffix, collect_file_without_suffix } = this.config;
        this.regexp = ignore_img_html_element
            ? new RegExp("!\\[.*?\\]\\((?<src1>.*)\\)", "g")
            : new RegExp("!\\[.*?\\]\\((?<src1>.*)\\)|<img.*?src=\"(?<src2>.*?)\"", "g")
        this.resourceSuffixs = new Set(resource_suffix);
        this.fileSuffixs = new Set(markdown_suffix);
        this.resources = new Set();
        this.resourcesInFile = new Set();
        if (collect_file_without_suffix) {
            this.resourceSuffixs.add("");
        }
        this.nonExistInFile = null;
        this.nonExistInFolder = null;
        this.redirectPlugin = null;
        this.showWarnDialog = true;
        this.entities = {
            modal: document.querySelector("#plugin-resource-operation"),
            wrap: document.querySelector(".plugin-resource-operation-wrap"),
            popup: document.querySelector(".plugin-resource-operation-popup"),
            iconGroup: document.querySelector(".plugin-resource-operation-icon-group"),
            move: document.querySelector('.plugin-resource-operation-icon-group [action="move"]'),
            $wrap: $(".plugin-resource-operation-wrap"),
        }
    }

    process = () => {
        this.utils.eventHub.addEventListener(this.utils.eventHub.eventType.allPluginsHadInjected, () => {
            this.redirectPlugin = this.utils.getCustomPlugin("redirectLocalRootUrl")
        })

        this.utils.dragFixedModal(this.entities.move, this.entities.modal, false);
        this.entities.iconGroup.addEventListener("click", ev => {
            const target = ev.target.closest("[action]");
            if (target) {
                const action = target.getAttribute("action");
                this[action] && this[action](ev);
            }
        })
        this.entities.wrap.addEventListener("click", async ev => {
            const target = ev.target.closest("button[action]");
            if (!target) return;
            const tr = target.closest("tr");
            if (!tr) return;
            const img = tr.querySelector("img");
            if (!img) return;

            const src = img.getAttribute("src");
            const action = target.getAttribute("action");
            if (action === "delete") {
                if (this.showWarnDialog) {
                    const filename = this.utils.getFileName(src, false);
                    const checkboxLabel = "不再提示（直到关闭Typora）";
                    const option = { type: "warning", buttons: ["确定", "取消"], message: `是否删除文件 ${filename}`, checkboxLabel };
                    const { response, checkboxChecked } = await this.utils.showMessageBox(option);
                    if (response === 1) return;
                    if (checkboxChecked) {
                        this.showWarnDialog = false;
                    }
                }
                await this.utils.Package.Fs.promises.unlink(src);
                this.utils.removeElement(tr);
                this.nonExistInFile.delete(src);
            } else if (action === "locate") {
                this.utils.showInFinder(src);
            }
        })
    }

    callback = async anchorNode => await this.utils.withProcessingHint(this.run)

    run = async () => {
        await this.collectImage();
        this.initModalRect();
        this.initModalTable();
        this.utils.show(this.entities.modal);
    }

    initModalRect = (resetLeft = true) => {
        const { left, width, height } = this.utils.entities.eContent.getBoundingClientRect();
        const { modal_left_percent: l, modal_width_percent: w, modal_height_percent: h } = this.config;
        const style = { width: `${width * w / 100}px`, height: `${height * h / 100}px` };
        if (resetLeft) {
            style.left = `${left + width * l / 100}px`;
        }
        Object.assign(this.entities.modal.style, style);
    }

    initModalTable = () => {
        const output = this.getOutput();
        delete output.resource_non_exist_in_file;
        delete output.resource_non_exist_in_folder;
        const replacer = (key, value) => Array.isArray(value) ? value.join("|") : value

        const btnGroup = `<td><div class="btn-group"><button type="button" class="btn btn-default" action="locate">打开</button><button type="button" class="btn btn-default" action="delete">删除</button></div></td>`
        const nonExistInFile = Array.from(this.nonExistInFile, (row, idx) => `<tr><td>${idx + 1}</td><td>${row}</td><td class="plugin-common-hidden"><img src="${row}"/></td>${btnGroup}</tr>`)
        const nonExistInFolder = Array.from(this.nonExistInFolder, (row, idx) => `<tr><td>${idx + 1}</td><td>${row}</td></tr>`)
        const tbody1 = nonExistInFile.join("") || '<tr><td colspan="4" style="text-align: center">Empty</td></tr>';
        const tbody2 = nonExistInFolder.join("") || '<tr><td colspan="2" style="text-align: center">Empty</td></tr>';

        this.entities.wrap.innerHTML = `
            <table class="table non-exist-in-file-table">
                 <caption>存在于挂载目录但不存在于 MD 文件的资源(共${this.nonExistInFile.size}项)</caption>
                 <thead><tr><th>#</th><th>resource</th><th class="plugin-common-hidden">preview</th><th>operation</th></tr></thead>
                 <tbody>${tbody1}</tbody>
            </table>
            <table class="table">
                 <caption>存在于 MD 文件但不存在于挂载目录的资源(共${this.nonExistInFolder.size}项)</caption>
                 <thead><tr><th>#</th><th>resource</th></tr></thead>
                 <tbody>${tbody2}</tbody>
            </table>
            <div class="plugin-resource-operation-message">配置</div>
            <textarea rows="10" readonly>${JSON.stringify(output, replacer, "\t")}</textarea>
        `
    }

    close = () => {
        this.nonExistInFile = null;
        this.nonExistInFolder = null;
        this.entities.wrap.innerHTML = "";
        this.utils.hide(this.entities.modal);
        this.togglePreview(false);
    }

    togglePreview = force => {
        const icon = this.entities.iconGroup.querySelector('[action="togglePreview"]');
        const wantClose = force === false || icon.classList.contains("ion-eye");
        this.entities.wrap.querySelectorAll(".non-exist-in-file-table td:nth-of-type(3), .non-exist-in-file-table th:nth-of-type(3)")
            .forEach(e => e.classList.toggle("plugin-common-hidden", wantClose));
        const func = wantClose ? "off" : "on";
        const className = "img";
        this.entities.$wrap
            [func]("mouseover", className, this._showPopup)
            [func]("mouseout", className, this._hidePopup)
            [func]("mousemove", className, this._showPopup);
        icon.classList.toggle("ion-eye-disabled", wantClose);
        icon.classList.toggle("ion-eye", !wantClose);
    }
    _hidePopup = ev => this.utils.hide(this.entities.popup)
    _showPopup = ev => {
        const popup = this.entities.popup;
        if (!popup) return;

        popup.src = ev.target.getAttribute("src");
        const left = Math.min(window.innerWidth - 10 - popup.offsetWidth, ev.clientX + 10);
        const top = Math.min(window.innerHeight - 50 - popup.offsetHeight, ev.clientY + 20);
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        this.utils.show(popup);
    }

    getOutput = (format = "obj") => {
        const _obj = {
            search_folder: this.utils.getMountFolder(),
            resource_suffix: Array.from(this.resourceSuffixs),
            markdown_suffix: Array.from(this.fileSuffixs),
            ignore_img_html_element: this.config.ignore_img_html_element,
            collect_file_without_suffix: this.config.collect_file_without_suffix,
            ignore_folders: this.config.ignore_folders,
            resource_non_exist_in_file: Array.from(this.nonExistInFile),
            resource_non_exist_in_folder: Array.from(this.nonExistInFolder),
        }

        const obj = () => _obj
        const json = () => JSON.stringify(_obj, null, "\t")
        const yaml = () => this.utils.stringifyYaml(_obj)
        const toml = () => this.utils.stringifyToml(_obj)
        const md = () => `
## 存在于挂载目录，但是不存在于 MD 文件的资源(共${_obj.resource_non_exist_in_file.length}项)

\`\`\`plain
${_obj.resource_non_exist_in_file.join("\n")}
\`\`\`

## 存在于 MD 文件，但是不存在于挂载目录的资源(共${_obj.resource_non_exist_in_folder.length}项)

\`\`\`plain
${_obj.resource_non_exist_in_folder.join("\n")}
\`\`\`

`
        const f = { obj, json, yaml, toml, md }[format] || md
        return f()
    }

    download = async () => {
        let dir = this.utils.getCurrentDirPath()
        dir = (dir === ".") ? this.utils.getMountFolder() : dir
        dir = dir || this.utils.tempFolder

        const { canceled, filePath } = await JSBridge.invoke("dialog.showSaveDialog", {
            properties: ["saveFile", "showOverwriteConfirmation"],
            title: "导出",
            defaultPath: this.utils.Package.Path.join(dir, "resource-report.md"),
            filters: [
                { name: "All", extensions: ["md", "json", "yaml", "toml"] },
                { name: "MARKDOWN", extensions: ["md"] },
                { name: "JSON", extensions: ["json"] },
                { name: "YAML", extensions: ["yaml"] },
                { name: "TOML", extensions: ["toml"] },
            ]
        })
        if (canceled) return

        let ext = this.utils.Package.Path.extname(filePath).toLowerCase()
        ext = ext[0] === "." ? ext.slice(1) : ext
        const fileContent = this.getOutput(ext)

        const ok = await this.utils.writeFile(filePath, fileContent)
        ok && this.utils.showInFinder(filePath)
    }

    collectImage = async () => {
        await this.traverseDir(this.utils.getMountFolder(), this.collect);
        this.nonExistInFile = new Set([...this.resources].filter(x => !this.resourcesInFile.has(x)));
        this.nonExistInFolder = new Set([...this.resourcesInFile].filter(x => !this.resources.has(x)));
        this.resources.clear();
        this.resourcesInFile.clear();
    }

    collect = async (filePath, dir) => {
        const { existPath, isNetworkImage, isSpecialImage, Package: { Path, Fs } } = this.utils;
        const { promises: { readFile } } = Fs;
        const { resolve, extname } = Path;

        const getRealPath = async imagePath => {
            let idx = imagePath.lastIndexOf(")");
            while (idx !== -1) {
                const exist = await existPath(imagePath);
                if (exist) {
                    return imagePath;
                } else {
                    imagePath = imagePath.slice(0, idx);
                    idx = imagePath.lastIndexOf(")");
                }
            }
            return imagePath;
        }

        const collectMatch = content => {
            const sourceRoot = this._getCompatibleRootURL(filePath, content) || dir
            const promises = Array.from(content.matchAll(this.regexp), async match => {
                let src = match.groups.src1 || match.groups.src2;
                if (!src) return;

                src = src.trim().replace(/^</, "").replace(/>$/, "").trim();
                if (isNetworkImage(src) || isSpecialImage(src)) return;

                try {
                    src = decodeURIComponent(src).split("?")[0];
                } catch (e) {
                    console.warn("error path:", src);
                    return;
                }

                src = src.replace(/^\s*([\\/])/, "")
                src = resolve(sourceRoot, src)
                if (this.resourcesInFile.has(src)) return;

                const resourcePath = await getRealPath(src);
                if (this.resourceSuffixs.has(extname(resourcePath).toLowerCase())) {
                    this.resourcesInFile.add(resourcePath);
                }
                const remain = src.slice(resourcePath.length);
                if (remain) {
                    await collectMatch(remain + ")");
                }
            })
            return Promise.all(promises)
        }

        const ext = extname(filePath).toLowerCase();
        if (this.resourceSuffixs.has(ext)) {
            this.resources.add(filePath);
        } else if (this.fileSuffixs.has(ext)) {
            const data = await readFile(filePath)
            await collectMatch(data.toString())
        }
    }

    _getCompatibleRootURL = (filePath, content) => {
        // typora 支持使用 typora-root-url 的 front matter 重定向资源路径
        const { yamlObject } = this.utils.splitFrontMatter(content)
        const redirectURL = yamlObject && yamlObject["typora-root-url"]
        if (redirectURL) {
            return redirectURL
        }
        // 兼容重定向资源插件
        if (!this.redirectPlugin) return
        const ok = this.redirectPlugin.needRedirect(filePath)
        if (ok) {
            return this.redirectPlugin.config.root
        }
    }

    traverseDir = async (dir, callback) => {
        const { ignore_folders } = this.config;
        const { Fs: { promises: { readdir, stat } }, Path: { join } } = this.utils.Package;

        async function traverse(dir) {
            const files = await readdir(dir);
            await Promise.all(files.map(async file => {
                const filePath = join(dir, file);
                const stats = await stat(filePath);
                if (stats.isFile()) {
                    await callback(filePath, dir);
                } else if (stats.isDirectory() && !ignore_folders.includes(file)) {
                    await traverse(filePath);
                }
            }))
        }

        await traverse(dir);
    }
}

module.exports = {
    plugin: resourceOperationPlugin,
}
