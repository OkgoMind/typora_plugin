const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs/promises")

let settings, processedSchemas

function hasNestedProperty(obj, key) {
    if (key == null || typeof obj !== 'object' || obj === null) {
        return false
    }
    if (obj.hasOwnProperty(key)) {
        return true
    }

    let current = obj
    for (const k of key.split(".")) {
        if (current === null || typeof current !== "object" || !current.hasOwnProperty(k)) {
            return false
        }
        current = current[k]
    }
    return true
}

const isIgnored = (fixedName, key) => (
    (fixedName === "abc" && key.startsWith("VISUAL_OPTIONS"))
    || (fixedName === "markdownLint" && key.startsWith("rule_config"))
    || (fixedName === "marp" && key.startsWith("MARP_CORE_OPTIONS"))
)

const flattenKeys = (obj, prefix = [], result = new Set()) => {
    if (obj === null || typeof obj !== "object") {
        if (prefix.length > 0) {
            const genericKey = prefix.join(".").replace(/\.\d+/g, "")
            result.add(genericKey)
        }
        return result
    }
    for (const [key, val] of Object.entries(obj)) {
        if (val === null || typeof val !== "object") {
            const genericKey = [...prefix, key].join(".").replace(/\.\d+/g, "")
            result.add(genericKey)
        } else {
            flattenKeys(val, [...prefix, key], result)
        }
    }
    return result
}

test.before(async () => {
    const toml = require("../../plugin/global/core/lib/smol-toml.js")
    const [base, custom] = await Promise.all([
        fs.readFile("../plugin/global/settings/settings.default.toml", "utf-8"),
        fs.readFile("../plugin/global/settings/custom_plugin.default.toml", "utf-8")
    ])
    settings = { ...toml.parse(base), ...toml.parse(custom) }
})

test.before(() => {
    const schemas = require("../../plugin/preferences/schemas.js")
    processedSchemas = {}
    Object.entries(schemas).forEach(([fixedName, boxes]) => {
        processedSchemas[fixedName] = boxes.map(box => ({
            ...box,
            fields: box.fields.filter(ctl => ctl.key && ctl.type !== "static" && ctl.type !== "action")
        }))
    })
})


test("schemas should have no extra keys (Schema -> Settings)", t => {
    Object.entries(processedSchemas).forEach(([fixedName, boxes]) => {
        const setting = settings[fixedName]
        assert.ok(setting, `schemas has no such schema: ${fixedName}`)

        boxes.forEach(box => {
            box.fields.forEach(ctl => {
                assert.ok(hasNestedProperty(setting, ctl.key), `settings ${fixedName} has no such Key: ${ctl.key}`)
            })
        })
    })
})

test("schemas should have no missing keys (Settings -> Schema)", t => {
    for (const [fixedName, setting] of Object.entries(settings)) {
        const boxes = processedSchemas[fixedName]
        assert.ok(boxes, `schemas has no such schema: ${fixedName}`)

        const settingsKeySet = flattenKeys(setting)
        const schemaKeySet = new Set(
            boxes
                .flatMap(box => {
                    return box.fields.flatMap(field => {
                        return field.type === "table"
                            ? field.nestedBoxes.flatMap(b => b.fields.map(f => `${field.key}.${f.key}`))
                            : field.key
                    })
                })
                .map(e => e.replace(/\.\d+/g, ""))
        )
        for (const key of settingsKeySet) {
            assert.ok(schemaKeySet.has(key) || isIgnored(fixedName, key), `schemas ${fixedName} has no such Key: ${key}`)
        }
    }
})
