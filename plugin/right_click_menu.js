// 插件名称是通过配置文件引入的，为了避免XSS注入，不可使用innerHTML
class rightClickMenuPlugin extends BasePlugin {
    styleTemplate = () => {
        const { MENU_MIN_WIDTH, HIDE_OTHER_OPTIONS } = this.config;
        const map = { "default": "", "auto": "inherit" };
        const width = map[MENU_MIN_WIDTH] || MENU_MIN_WIDTH;
        const display = HIDE_OTHER_OPTIONS ? "none" : "";
        if (width || display) {
            return { menu_min_width: width, menu_option_display: display }
        }
    }

    init = () => {
        this.groupName = "typora-plugin";
        this.noExtraMenuGroupName = "typora-plugin-no-extra";
        this.dividerArg = "---";
        this.unavailableArgName = "不可点击";
        this.unavailableArgValue = "__not_available__";
        this.defaultDisableHint = "功能于此时不可用";
        this.supportShortcut = Boolean(document.querySelector(".ty-menu-shortcut"));
    }

    process = () => {
        this.utils.runtime.autoSaveConfig(this);
        this.utils.eventHub.addEventListener(this.utils.eventHub.eventType.allPluginsHadInjected, this.appendMenu)
    }

    appendMenu = () => {
        setTimeout(() => {
            this.appendFirst();  // 一级菜单汇总所有插件
            this.appendSecond(); // 二级菜单展示所有插件
            this.appendThird();  // 三级菜单展示插件的参数
            this.listen();
        }, 500)
    }

    appendFirst = () => {
        const items = this.config.MENUS.map(({ NAME, LIST = [] }, idx) => {
            const item = [{ ele: "span", "data-lg": "Menu", text: NAME }];
            const children = [{ ele: "a", role: "menuitem", children: item }];
            const noExtraMenu = LIST && LIST.length === 1;
            if (noExtraMenu) {
                return { ele: "li", "data-key": this.noExtraMenuGroupName, "data-value": LIST[0], idx, children };
            }
            item.push(this.caret());
            return { ele: "li", class_: "has-extra-menu", "data-key": this.groupName, idx, children };
        })
        const elements = [this.divider(), ...items];
        const menu = document.querySelector("#context-menu");
        this.utils.htmlTemplater.appendElements(menu, elements);
    }

    appendSecond = () => {
        this.findLostPluginIfNeed();

        const elements = this.config.MENUS.map(({ LIST = [] }, idx) => {
            const children = LIST.map(item => {
                if (item === this.dividerArg) return this.divider();

                const [fixedName, callArg] = item.split(".");
                const plugin = this.utils.getPlugin(fixedName);
                if (plugin) {
                    return callArg ? this.secondComposeLiTemplate(plugin, callArg) : this.secondLiTemplate(plugin)
                }
            }).filter(Boolean)
            return this.ulTemplate({ class_: ["plugin-menu-second"], idx, children });
        })
        this.utils.htmlTemplater.appendElements(this.utils.entities.eContent, elements);
    }

    appendThird = () => {
        const elements = this.config.MENUS.flatMap(({ LIST = [] }, idx) => {
            return LIST
                .filter(item => item !== this.dividerArg)
                .map(item => this.utils.getPlugin(item))
                .filter(plugin => plugin && (plugin.callArgs || plugin.dynamicCallArgsGenerator))
                .map(plugin => {
                    const children = (plugin.callArgs || []).map(arg => this.thirdLiTemplate(arg))
                    return { class_: ["plugin-menu-third"], "data-plugin": plugin.fixedName, idx, children }
                })
                .map(this.ulTemplate)
        })
        this.utils.htmlTemplater.appendElements(this.utils.entities.eContent, elements)
    }

    secondComposeLiTemplate = (plugin, callArg) => {
        const target = plugin.callArgs.find(arg => arg.arg_value === callArg);
        const name = target ? target.arg_name : plugin.config.NAME;
        const children = [{ ele: "a", role: "menuitem", "data-lg": "Menu", text: name }];
        return { ele: "li", class_: "plugin-menu-item", "data-key": plugin.fixedName, "data-value": callArg, children }
    }

    secondLiTemplate = plugin => {
        const hasArgs = plugin.callArgs || plugin.dynamicCallArgsGenerator;
        const clickable = hasArgs || plugin.hasOwnProperty("call");
        const extra = {
            class_: `plugin-menu-item ${hasArgs ? "has-extra-menu" : ""}`,
            style: clickable ? undefined : { color: "#c4c6cc", pointerEvents: "none" },
        }
        return this._liTemplate(plugin.fixedName, plugin.config.NAME, plugin.config.HOTKEY, hasArgs, null, extra);
    }

    thirdLiTemplate = (arg, dynamic) => {
        if (arg.arg_disabled && !arg.arg_hint) {
            arg.arg_hint = this.defaultDisableHint;
        }
        const extra = {
            "ty-hint": arg.arg_hint || undefined,
            class_: dynamic ? `plugin-dynamic-arg ${arg.arg_disabled ? "disabled" : ""}` : undefined,
        };
        const state = arg.arg_state ? "state-on" : "state-off";
        return this._liTemplate(arg.arg_value, arg.arg_name, arg.arg_hotkey, false, state, extra);
    }

    _liTemplate = (key, showName, shortcut, hasExtraMenu, class_, extra) => {
        if (shortcut) {
            shortcut = Array.isArray(shortcut) ? shortcut[0] : shortcut;
            shortcut = shortcut.split("+").map(e => e[0].toUpperCase() + e.slice(1).toLowerCase()).join("+");
        }
        const hasShortcut = this.supportShortcut && this.config.SHOW_PLUGIN_HOTKEY && shortcut;
        const attr = hasExtraMenu
            ? { children: [{ ele: "span", "data-lg": "Menu", text: showName, children: [this.caret()] }] }
            : hasShortcut
                ? { children: [{ ele: "span", text: showName }, { ele: "span", class_: "ty-menu-shortcut", text: shortcut }] }
                : { text: showName }
        const children = [{ ele: "a", role: "menuitem", class_, "data-lg": "Menu", ...attr }];
        return { ele: "li", "data-key": key, children, ...extra }
    }

    ulTemplate = extra => {
        extra.class_.push("dropdown-menu", "context-menu", "ext-context-menu");
        return { ele: "ul", role: "menu", ...extra }
    }

    divider = () => ({ ele: "li", class_: "divider" })
    caret = () => ({ ele: "i", class_: "fa fa-caret-right" })

    findLostPluginIfNeed = () => {
        if (!this.config.FIND_LOST_PLUGIN) return;

        const allPlugins = new Map(Object.entries(this.utils.getAllPlugins()));
        this.config.MENUS.forEach(menu => menu.LIST.forEach(plugin => allPlugins.delete(plugin)));
        for (const plugin of allPlugins.values()) {
            this.config.MENUS[this.config.MENUS.length - 1].LIST.push(plugin.fixedName);
        }
    }

    showMenuItem = ($after, $before) => {
        const margin = 6;
        const { left, top, width, height } = $before[0].getBoundingClientRect();
        let afterTop = top - height;
        let afterLeft = left + width + margin;

        const footer = document.querySelector("footer");
        const footerHeight = footer ? footer.getBoundingClientRect().height : 0;

        $after.addClass("show");
        const { height: afterHeight, width: afterWidth } = $after[0].getBoundingClientRect();
        afterTop = Math.min(afterTop, window.innerHeight - afterHeight - footerHeight);
        afterLeft = afterLeft + afterWidth < window.innerWidth ? afterLeft : Math.max(0, left - afterWidth - margin);

        $after.css({ top: afterTop + "px", left: afterLeft + "px" });
    }

    appendThirdLi = ($menu, dynamicCallArgs) => {
        dynamicCallArgs.forEach(arg => $menu.append(this.utils.htmlTemplater.create(this.thirdLiTemplate(arg, true))))
    }
    appendDummyThirdLi = $menu => this.appendThirdLi($menu, [{
        arg_name: this.unavailableArgName,
        arg_value: this.unavailableArgValue,
        arg_disabled: true,
    }])

    listen = () => {
        const that = this;
        const removeShow = ele => ele.classList.remove("show");
        const removeActive = ele => ele.classList.remove("active");

        // 点击一级菜单
        $("#context-menu").on("click", `[data-key="${this.noExtraMenuGroupName}"]`, function () {
            const value = this.getAttribute("data-value");
            if (!value) return false;
            const [fixedName, callArg] = value.split(".");
            if (!fixedName || !callArg) return false;
            that.utils.generateDynamicCallArgs(fixedName);
            const plugin = that.utils.getPlugin(fixedName);
            that.dynamicCallPlugin(plugin, callArg);
            that.hideMenuIfNeed();
            // 展示二级菜单
        }).on("mouseenter", "[data-key]", function () {
            const $first = $(this);
            if (that.groupName === $first.attr("data-key")) {
                const idx = this.getAttribute("idx");
                if (document.querySelector(".plugin-menu-second.show")) {
                    document.querySelectorAll(`.plugin-menu-third:not([idx="${idx}"])`).forEach(removeShow);
                }
                const otherSecond = document.querySelectorAll(`.plugin-menu-second:not([idx="${idx}"])`);
                otherSecond.forEach(ele => ele.querySelectorAll(".plugin-menu-item.active").forEach(removeActive));
                otherSecond.forEach(removeShow);
                that.showMenuItem($(`.plugin-menu-second[idx="${idx}"]`), $first);
                $first.addClass("active");
            } else {
                document.querySelectorAll(`#context-menu li[data-key="${that.groupName}"]`).forEach(removeActive);
                document.querySelectorAll(".plugin-menu-second, .plugin-menu-third").forEach(removeShow);
            }
        })

        // 展示三级菜单
        $(".plugin-menu-second").on("mouseenter", "[data-key]", function () {
            const $second = $(this);
            document.querySelectorAll(".plugin-menu-third").forEach(removeShow);
            document.querySelectorAll(".plugin-dynamic-arg").forEach(ele => ele.parentElement.removeChild(ele));
            const fixedName = $second.attr("data-key");
            const $third = $(`.plugin-menu-third[data-plugin="${fixedName}"]`);
            const dynamicCallArgs = that.utils.generateDynamicCallArgs(fixedName);
            if (dynamicCallArgs) {
                that.appendThirdLi($third, dynamicCallArgs);
            }
            if ($third.children().length === 0) {
                that.appendDummyThirdLi($third);
            }
            if ($second.find('span[data-lg="Menu"]').length) {
                that.showMenuItem($third, $second);
            } else {
                removeActive(document.querySelector(".plugin-menu-second .has-extra-menu"));
            }
            // 在二级菜单中调用插件
        }).on("click", "[data-key]", function () {
            const fixedName = this.getAttribute("data-key");
            const callArg = this.getAttribute("data-value");
            const plugin = that.utils.getPlugin(fixedName);
            if (callArg) {
                that.dynamicCallPlugin(plugin, callArg);
            } else {
                // 拥有三级菜单的，不允许点击二级菜单
                if (!plugin || plugin.callArgs || plugin.dynamicCallArgsGenerator) return false;
                that.callPlugin(plugin);
            }
            that.hideMenuIfNeed();
        })

        // 在三级菜单中调用插件
        $(".plugin-menu-third").on("click", "[data-key]", function () {
            // 点击禁用的选项
            if (this.classList.contains("disabled")) return false;

            const fixedName = this.parentElement.getAttribute("data-plugin");
            const callArg = this.getAttribute("data-key");
            const plugin = that.utils.getPlugin(fixedName);
            that.dynamicCallPlugin(plugin, callArg);
            that.hideMenuIfNeed(fixedName);
        })
    }

    callPlugin = plugin => plugin.call && plugin.call();

    dynamicCallPlugin = (plugin, arg) => {
        if (arg !== this.unavailableArgValue && plugin && plugin.call) {
            this.utils.withMeta(meta => plugin.call(arg, meta));
        }
    }

    hideMenuIfNeed = key => {
        if (!this.config.DO_NOT_HIDE) {
            File.editor.contextMenu.hide();
            return;
        }
        if (key) {
            $(`.plugin-menu-item[data-key="${key}"]`).trigger("mouseenter");  // refresh third menu
        }
    }

    toggleHotkey = () => {
        this.config.SHOW_PLUGIN_HOTKEY = !this.config.SHOW_PLUGIN_HOTKEY;
        const toggle = func => {
            const fn = menu => menu.querySelectorAll(".ty-menu-shortcut").forEach(e => e.classList[func]("plugin-common-hidden"));
            document.querySelectorAll(".plugin-menu-second, .plugin-menu-third").forEach(fn);
        }
        const fn = this.config.SHOW_PLUGIN_HOTKEY ? "remove" : "add";
        toggle(fn);
    }

    dynamicCallArgsGenerator = () => {
        const args = [
            { arg_name: "启用功能：保持显示", arg_value: "do_not_hide", arg_state: this.config.DO_NOT_HIDE, arg_hint: "右键菜单点击后不会自动消失" },
            { arg_name: "启用功能：隐藏除插件外的选项", arg_value: "hide_other_options", arg_state: this.config.HIDE_OTHER_OPTIONS },
        ]
        if (this.supportShortcut) {
            args.push({ arg_name: "启用功能：显示快捷键", arg_value: "toggle_hotkey", arg_state: this.config.SHOW_PLUGIN_HOTKEY })
        }
        return args
    }

    call = async type => {
        if (type === "do_not_hide") {
            this.config.DO_NOT_HIDE = !this.config.DO_NOT_HIDE
        } else if (type === "hide_other_options") {
            this.config.HIDE_OTHER_OPTIONS = !this.config.HIDE_OTHER_OPTIONS
            await this.utils.styleTemplater.reset(this.fixedName, this.styleTemplate())
        } else if (type === "toggle_hotkey") {
            this.toggleHotkey()
        }
    }
}

module.exports = {
    plugin: rightClickMenuPlugin
}

