/**
 * grammar:
 *   <query> ::= <expr>
 *   <expr> ::= <term> ( <or> <term> )*
 *   <term> ::= <factor> ( <not_and> <factor> )*
 *   <factor> ::= '"' [<keyword>] '"' | <keyword> | '(' <expr> ')'
 *   <not_and> ::= '-' | ' '
 *   <or> ::= 'OR' | '|'
 *   <keyword> ::= [^"]+
 */
class searchStringParser {
    constructor(utils) {
        this.utils = utils;
        this.TYPE = {
            OR: "OR",
            AND: "AND",
            NOT: "NOT",
            PAREN_OPEN: "PAREN_OPEN",
            PAREN_CLOSE: "PAREN_CLOSE",
            KEYWORD: "KEYWORD",
            PHRASE: "PHRASE",
        }
        this.TOKEN = {
            OR: { type: this.TYPE.OR, value: "OR" },
            AND: { type: this.TYPE.AND, value: " " },
            NOT: { type: this.TYPE.NOT, value: "-" },
            PAREN_OPEN: { type: this.TYPE.PAREN_OPEN, value: "(" },
            PAREN_CLOSE: { type: this.TYPE.PAREN_CLOSE, value: ")" },
            PHRASE: value => ({ type: this.TYPE.PHRASE, value }),
            KEYWORD: value => ({ type: this.TYPE.KEYWORD, value })
        }
    }

    _tokenize(query) {
        const tokens = [];
        let i = 0;
        while (i < query.length) {
            if (query[i] === '"') {
                const start = i + 1;
                i++;
                while (i < query.length && query[i] !== '"') {
                    i++;
                }
                tokens.push(this.TOKEN.PHRASE(query.substring(start, i)));
                i++;
            } else if (query[i] === "(") {
                tokens.push(this.TOKEN.PAREN_OPEN);
                i++;
            } else if (query[i] === ")") {
                tokens.push(this.TOKEN.PAREN_CLOSE);
                i++;
            } else if (query[i].toUpperCase() === "O" && query.substring(i, i + 2).toUpperCase() === "OR") {
                tokens.push(this.TOKEN.OR);
                i += 2;
            } else if (query[i] === "|") {
                tokens.push(this.TOKEN.OR);
                i++;
            } else if (query[i] === "-") {
                tokens.push(this.TOKEN.NOT);
                i++;
            } else if (/\s/.test(query[i])) {
                i++; // skip whitespace
            } else {
                const start = i;
                while (i < query.length && !/\s|"|\(|\)|-/.test(query[i])) {
                    i++;
                }
                tokens.push(this.TOKEN.KEYWORD(query.substring(start, i)));
            }
        }

        const result = [];
        const l1 = [this.TYPE.NOT, this.TYPE.OR, this.TYPE.PAREN_OPEN];
        const l2 = [this.TYPE.NOT, this.TYPE.OR, this.TYPE.PAREN_CLOSE];
        for (let i = 0; i < tokens.length; i++) {
            const current = tokens[i];
            const previous = tokens[i - 1];
            const should = previous && !l1.includes(previous.type) && !l2.includes(current.type);
            if (should) {
                result.push(this.TOKEN.AND)
            }
            result.push(current);
        }
        return result;
    }

    _parseExpression(tokens) {
        let node = this._parseTerm(tokens);
        while (tokens.length > 0) {
            const type = tokens[0].type;
            if (type === this.TYPE.OR) {
                tokens.shift();
                const right = this._parseTerm(tokens);
                node = { type, left: node, right };
            } else {
                break;
            }
        }
        return node;
    }

    _parseTerm(tokens) {
        let node = this._parseFactor(tokens);
        while (tokens.length > 0) {
            const type = tokens[0].type;
            if (type === this.TYPE.NOT || type === this.TYPE.AND) {
                tokens.shift();
                const right = this._parseFactor(tokens);
                node = { type, left: node, right };
            } else {
                break;
            }
        }
        return node;
    }

    _parseFactor(tokens) {
        const type = tokens[0].type;
        if (type === this.TYPE.PHRASE || type === this.TYPE.KEYWORD) {
            return { type, value: tokens.shift().value };
        } else if (type === this.TYPE.PAREN_OPEN) {
            tokens.shift();
            const node = this._parseExpression(tokens);
            if (tokens.shift().type !== this.TYPE.PAREN_CLOSE) {
                throw new Error("Expected ')'");
            }
            return node;
        }
    }

    _withNotification(func) {
        try {
            return func();
        } catch (e) {
            this.utils.notification.show("语法解析错误，请检查输入内容", "error");
        }
    }

    showGrammar() {
        const table1 = `
            <table>
                <tr><th>Token</th><th>Desc</th></tr>
                <tr><td>whitespace</td><td>表示与，即文档应该同时包含全部关键词</td></tr>
                <tr><td>OR</td><td>表示或，即文档应该包含关键词之一</td></tr>
                <tr><td>-</td><td>表示非，即文档不能包含关键词</td></tr>
                <tr><td>""</td><td>词组</td></tr>
                <tr><td>()</td><td>调整运算顺序</td></tr>
            </table>
        `
        const table2 = `
            <table>
                <tr><th>Example</th><th>Desc</th></tr>
                <tr><td>foo bar</td><td>搜索包含 foo 和 bar 的文档</td></tr>
                <tr><td>"foo bar"</td><td>搜索包含 foo bar 这一词组的文档</td></tr>
                <tr><td>foo OR bar</td><td>搜索包含 foo 或包含 bar 的文档</td></tr>
                <tr><td>foo -bar</td><td>搜索包含 foo 但不包含 bar 的文档</td></tr>
                <tr><td>(a OR b) (c OR d)</td><td>搜索包含 a 或 b，且包含 c 或 d 的文档</td></tr>
            </table>
        `
        const content = `
<query> ::= <expr>
<expr> ::= <term> ( <or> <term> )*
<term> ::= <factor> ( <not_and> <factor> )*
<factor> ::= '"' [<keyword>] '"' | <keyword> | '(' <expr> ')'
<or> ::= 'OR' | '|'
<not_and> ::= '-' | ' '
<keyword> ::= [^"]+`
        const title = "你可以将这段内容塞给AI，它会为你解释";
        const components = [{ label: table1, type: "p" }, { label: table2, type: "p" }, { label: "", type: "textarea", rows: 7, content, title }];
        this.utils.dialog.modal({ title: "搜索语法", width: "550px", components });
    }

    parse(query) {
        return this._withNotification(() => {
            const tokens = this._tokenize(query);
            if (tokens.length === 0) {
                return this.TOKEN.KEYWORD("")
            }
            const result = this._parseExpression(tokens);
            if (tokens.length !== 0) {
                throw new Error(`parse error. remind tokens: ${tokens}`)
            }
            return result
        })
    }

    traverse(ast, callback) {
        if (ast == null) return;
        this.traverse(ast.left, callback);
        this.traverse(ast.right, callback);
        callback(ast);
    }

    parseAndTraverse(query, callback) {
        const ast = this.parse(query);
        this.traverse(ast, callback);
        return ast
    }

    check(query, content, option = {}) {
        if (!option.caseSensitive) {
            query = query.toLowerCase();
            content = content.toLowerCase();
        }
        const ast = this.parse(query);
        return this.checkByAST(ast, content);
    }

    checkByAST(ast, content) {
        const { KEYWORD, PHRASE, OR, AND, NOT } = this.TYPE;
        this.traverse(ast, node => {
            const { type, left, right, value } = node;
            switch (type) {
                case KEYWORD:
                case PHRASE:
                    node._result = content.includes(value);
                    break
                case OR:
                    node._result = left._result || right._result;
                    break
                case AND:
                    node._result = left._result && right._result;
                    break
                case NOT:
                    node._result = (left ? left._result : true) && !right._result;
                    break
                default:
                    throw new Error(`Error Node: {type: ${node.type}, value: ${node.value}}`)
            }
        });
        // console.log(JSON.stringify(ast, null, 2));
        return ast._result
    }

    getQueryTokens(query) {
        const { KEYWORD, PHRASE, OR, AND, NOT } = this.TYPE;
        const ast = this.parseAndTraverse(query, node => {
            const { type, left, right, value } = node;
            switch (type) {
                case KEYWORD:
                case PHRASE:
                    node._result = [value];
                    break
                case OR:
                case AND:
                    node._result = [...left._result, ...right._result];
                    break
                case NOT:
                    node._result = (left ? left._result : []).filter(e => !right._result.includes(e));
                    break
                default:
                    throw new Error(`Error Node: {type: ${node.type}, value: ${node.value}}`)
            }
        })
        // console.log(JSON.stringify(ast, null, 2));
        return ast._result;
    }
}

module.exports = {
    searchStringParser
}