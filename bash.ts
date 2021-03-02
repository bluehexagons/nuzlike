((global : any): void => {
  'use strong'
  enum Error {
    eof,
    closed,
    unexpectedEof,
    unexpectedToken,
    unknownError,
    unknownToken
  }
  global.BashError = Error
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  interface Reader {
    read() : Promise<[string, Error]>
    readChar() : Promise<[string, Error]>
    peek() : Promise<[string, Error]>
  }
  interface Writer {
    write(s : string) : Error
  }
  class ReadWriter implements Reader, Writer {
    buf : string[] = []
    at : number = 0
    err : Error = null
    resume : ((val : Error) => void)[] = []
    wait() : Promise<Error> {
      return new Promise(resolve => {
        if (this.err !== null) {
          resolve(this.err)
          return
        }
        this.resume.push(resolve)
      })
    }
    async read() : Promise<[string, Error]> {
      if (this.buf.length === 0) {
        this.err = await this.wait()
      }
      if (this.err !== null && this.buf.length === 0) {
        return <[string, Error]>['', this.err]
      }

      let s : [string, Error]
      if (this.at > 0) {
        s = [this.buf.shift().substring(this.at) + this.buf.join(''), null]
        this.at = 0
      } else {
        s = [this.buf.join(''), null]
      }
      this.buf.length = 0
      return s
    }
    async readChar() : Promise<[string, Error]> {
      let err : Error
      while (this.buf.length === 0) {
        err = await this.wait()
        if (err !== null) {
          break
        }
        while (this.buf.length > 0 && this.buf[0].length === 0) {
          this.buf.shift()
          this.at = 0
        }
      }
      if (err !== null && this.buf.length === 0) {
        return <[string, Error]>['', err]
      }

      let s : [string, Error] = [this.buf[0][this.at], null]
      this.at++
      if (this.at >= this.buf[0].length) {
        this.at = 0
        this.buf.shift()
      }

      return s
    }
    async peek() : Promise<[string, Error]> {
      let err : Error
      while (this.buf.length === 0) {
        err = await this.wait()
        if (err !== null) {
          break
        }
        while (this.buf.length > 0 && this.buf[0].length === 0) {
          this.buf.shift()
          this.at = 0
        }
      }
      if (err !== null && this.buf.length === 0) {
        return <[string, Error]>['', err]
      }

      let s : [string, Error] = [this.buf[0][this.at], null]

      return s
    }
    write(s : string) : Error {
      if (this.err !== null) {
        return this.err
      }
      this.buf.push(s)
      while (this.resume.length > 0 && this.buf.length > 0) {
        this.resume.shift()(null)
      }
      return null
    }
    readSync() : [string, Error] {
      let s : [string, Error]
      if (this.at > 0) {
        s = [this.buf.shift().substring(this.at) + this.buf.join(''), this.err]
        this.at = 0
      } else {
        s = [this.buf.join(''), this.err]
      }
      this.buf.length = 0
      return s
    }
    close() : Error {
      if (this.err !== null) {
        return this.err
      }
      while (this.resume.length > 0) {
        this.resume.pop()(Error.eof)
      }
      this.err = Error.eof
      return null
    }
    reset() {
      this.err = null
      this.buf.length = 0
      while (this.resume.length > 0) {
        this.resume.pop()(Error.eof)
      }
    }
  }
  global.ReadWriter = ReadWriter


  class Scanner {
    constructor(r : Reader) {
      this.reader = r
    }
    private reader : Reader
    static test = {
      ident: (s : string) =>
        (s >= 'a' && s <= 'z') ||
        (s >= 'A' && s <= 'Z') ||
        (s >= '0' && s <= '9') ||
        s === '_',
      digit: (s: string) => s >= '0' && s <= '9',
      letter: (s: string) => (s >= 'a' && s <= 'z') || (s >= 'A' && s <= 'Z'),
      whitespace: (s: string) => (s === ' ' || s === '\t' || s === '\v'),
      notQuot: (s: string) => s !== '\''
    }
    async scan(test : (s : string) => boolean) : Promise<[string, Error]> {
      let s : string = ''
      let c : string
      let err : Error
      while ([c, err] = await this.reader.peek(), err === null && test(c)) {
        [c, err] = await this.reader.readChar()
        if (err !== null) {
          return <[string, Error]>[s, err]
        }
        s += c
      }

      return <[string, Error]>[s, err]
    }
    peek() : Promise<[string, Error]> {
      return this.reader.peek()
    }
    read() : Promise<[string, Error]> {
      return this.reader.readChar()
    }

    debug(test = Scanner.test.ident) : void {
      this.scan(test).then(v => console.log('scanned', '"' + v[0] + '"', v[1] === null ? null : Error[v[1]]))
    }
  }
  global.Scanner = Scanner


  enum TokenKind {
    whitespace,
    identifier,
    lparen,
    rparen,
    pipe,
    pipepipe,
    amp,
    ampamp,
    lt,
    ltlt,
    ltlparen,
    ltltlt,
    gt,
    gtgt,
    hash,
    dol,
    lbrace,
    rbrace,
    semicolon,
    unknown,
    newline,
    backslash,
    quot,
    dblquot,
    backtick,
    sub,
    pipeamp,
    oneamp,
    gtamp,
    redirect1,
    redirect2,
    redirect1to2,
    redirect2to1
  }
  type op = {[char : string]: (TokenKind | op)};
  // todo: algorithm doesn't recurse right through this tree
  // currently requires that all steps be valid operators
  // {
  let operators : op = {
    '(': TokenKind.lparen,
    ')': TokenKind.rparen,
    '|': {
      '|': TokenKind.pipe,
      '||': TokenKind.pipepipe,
      '|&': TokenKind.pipeamp // TODO
    },
    '&': {
      '&': TokenKind.amp,
      '&&': TokenKind.ampamp
    },
    '<': {
      '<': TokenKind.lt,
      '<(': TokenKind.ltlparen, // TODO process redirection (returns a "file name" that's a FIFO buffer)
      '<<': {
        '<<': TokenKind.ltlt, // TODO https://www.linuxquestions.org/questions/linux-newbie-8/what-does-the-double-less-than-sign-means-in-creating-a-new-file-with-cat-828335/
        // << will cause a special shell command that reads a chunk of data line by line?
        // actually, just need real ways for programs to read from shell
        // read line, read character (like now)
        '<<<': TokenKind.ltltlt // TODO: only scan one identifier? (for a lot of these)
      }
    },
    '>': {
      '>': TokenKind.gt,
      '>>': TokenKind.gtgt,
      '>&': TokenKind.gtamp // TODO write stdout and stderr
    },
    /*'1': {
      '1>': {
        '1>': TokenKind.redirect1,
        '1>&': {
          '1>&2': TokenKind.redirect1to2
        }
      }
    },
    '2': {
      '2>': {
        '2>': TokenKind.redirect2,
        '2>&': {
          '2>&1': TokenKind.redirect2to1
        }
      }
    },*/
    '#': TokenKind.hash,
    '$': {
      '$': TokenKind.dol,
      '$(': TokenKind.sub
    },
    // '{': TokenKind.lbrace,
    // '}': TokenKind.rbrace,
    ';': TokenKind.semicolon,
    '\n': TokenKind.newline,
    '\\': TokenKind.backslash,
    '\'': TokenKind.quot,
    '"': TokenKind.dblquot,
    '`': TokenKind.backtick
  }
  let notOperator = (s : string) => !operators.hasOwnProperty(s)
  let nonOpIdent = (s : string) => s !== ' ' && s !== '\t' && s !== '\v' && !operators.hasOwnProperty(s)
  class Token {
    kind : TokenKind
    value : string
  }

  class Lexer {
    scanner : Scanner
    scanOverride : (s : string) => boolean = null
    constructor(s : Scanner) {
      this.scanner = s
    }
    async debug() {
      let t : Token
      let err : Error
      let results : any[] = []
      while ([t, err] = await this.next()) {
        if (t === null) {
          results.push({token: null, value: null, error: Error[err]})
          if (err !== null) {
            break
          }
          continue
        }
        results.push({token: TokenKind[t.kind], value: t.value, error: Error[err] || err})
        if (err !== null) {
          break
        }
      }
      global.lastResults = results
      global.console.table(results)
    }
    async read() : Promise<[Token, Error]> {
      let val = <[Token, Error]>[null, null]
      let [c, err] = await this.scanner.peek()
      if (err !== null) {
        val[1] = err
        return val
      }

      /* let actuallyOperator = false // this just needs to be redone to properly recurse backward through tree.. dumb hacky workaround
      let unread = ''
      if (Scanner.test.digit(c)) {
        let [digit, err] = await this.scanner.read()
        ;[c, err] = await this.scanner.peek()
        if (err !== null && operators[digit + c]) {
          actuallyOperator = true
        } else {
          unread = digit
        }
      } */
      if (notOperator(c)) {
        if (Scanner.test.whitespace(c)) {
          let [s, err] = await this.scanner.scan(Scanner.test.whitespace)
          if (err !== null && err !== Error.eof) {
            // if we hit the end we don't care about getting an error here
            // the error will be there when we come back
            // would rather return [null, Error.eof] than the last token w/eof
            val[1] = err
            return val
          }
          val[0] = {
            kind: TokenKind.whitespace,
            value: s
          }
          return val
        }
        let [s, err] = await this.scanner.scan(nonOpIdent)
        if (err !== null && err !== Error.eof) {
          val[1] = err
          return val
        }
        val[0] = {
          kind: TokenKind.identifier,
          value: s
        }
        return val
      }

      let tok : TokenKind
      [c, err] = await this.scanner.read()
      if (err !== null) {
        val[1] = err
        return val
      }
      if (typeof operators[c] === 'object') {
        let at = <op>operators[c]
        let ch : string
        while ([ch, err] = await this.scanner.peek(), err === null) {
          if (!at.hasOwnProperty(c + ch)) {
            tok = <TokenKind>at[c]
            break
          }
          [ch, err] = await this.scanner.read()
          if (err !== null) {
            val[1] = err
            return val
          }
          if (typeof at[c + ch] === 'object') {
            c = c + ch
            at = <op>at[c]
            continue
          }
          c = c + ch
          tok = <TokenKind>at[c]
          break
        }
        if (err !== null) {
          tok = <TokenKind>at[c]
        }
      } else {
        tok = <TokenKind>operators[c]
      }
      if (tok === TokenKind.backslash) {
        [c, err] = await this.scanner.read()
        if (err !== null) {
          val[1] = err === Error.closed || err === Error.eof ? Error.unexpectedEof : err
          return val
        }
        if (c === '\n') {
          tok = TokenKind.backslash
        } else {
          tok = TokenKind.identifier
        }
      }
      val[0] = {
        kind: tok,
        value: c
      }
      
      return val
    }
    async next() : Promise<[Token, Error]> {
      if (this.scanOverride !== null) {
        let [s, err] = await this.scanner.scan(this.scanOverride)
        this.scanOverride = null
        if (err !== null) {
          return <[Token, Error]>[null, err]
        }
        let ch : string
        [ch, err] = await this.scanner.read()
        return <[Token, Error]>[
          {
            kind: TokenKind.identifier,
            value: s
          },
          err
        ]
      }
      let val = ''
      let kind : TokenKind = null
      let token : Token = null
      let error : Error = null
      while (true) {
        let [tok, err] = await this.read()
        if (err !== null) {
          error = err
          break
        }
        if (tok.kind !== TokenKind.backslash) {
          val += tok.value
          kind = tok.kind
        }
        if (kind === null) {
          continue
        }
        if (kind === TokenKind.identifier) {
          let [c, err] = await this.scanner.peek()
          if (err !== null) {
            if (err !== Error.closed && err !== Error.eof) {
              error = err
            }
            break
          }

          if (c === '\\' || (notOperator(c) && !Scanner.test.whitespace(c))) {
            continue
          }
          break
        }
        if (kind === TokenKind.whitespace) {
          let [c, err] = await this.scanner.peek()
          if (err !== null) {
            if (err !== Error.closed && err !== Error.eof) {
              error = err
            }
            break
          }

          if (Scanner.test.whitespace(c)) {
            continue
          }
          
          /*if (c === '\\') {
            let 
          }*/
        }
        break
      }
      if (error === null) {
        token = {
          kind: kind,
          value: val
        }
      }
      return <[Token, Error]>[token, error]
    } 
  }
  global.Lexer = Lexer
  
  enum NodeKind {
    sequence = 1,
    join = 1 << 1,
    ident = 1 << 2,
    split = 1 << 3,
    whitespace = 1 << 4
  }
  interface Host {
    exec : (args : string[], stdin : Reader, stdout : Writer, stderr : Writer) => Promise<number>
    env : (name : string) => string
  }
  interface AST {
    kind : NodeKind
    parent : AST
    parse(t : Token, lex : Lexer) : [AST, Error]
    pop() : [AST, Error]
    push(ast : AST) : Error
    run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number>
  }
  class Sequence implements AST {
    kind = NodeKind.sequence
    body : AST[] = []
    parent : AST = null
    parse(t : Token, lex : Lexer) : [AST, Error] {
      return [this, null]
    }
    last() : [AST, Error] {
      if (this.body.length === 0) {
        return [null, Error.unexpectedToken]
      }
      return [this.body[this.body.length - 1], null]
    }
    pop() : [AST, Error] {
      if (this.body.length === 0) {
        return [null, Error.unexpectedToken]
      }
      let ast = this.body.pop()
      ast.parent = null
      return [ast, null]
    }
    push(ast : AST) : Error {
      this.body.push(ast)
      ast.parent = this
      return null
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      console.log('Generic Sequence run')
      for (let ast of this.body) {
        console.log('ran: ', await ast.run(host, stdin, stdout, stderr))
      }
      return 0
    }
  }
  class Join implements AST {
    kind = NodeKind.join
    parent : AST = null
    left : AST
    right : AST
    findScript() : Script {
      let parent : AST = this.parent
      while (parent !== null && !(parent instanceof Script)) {
        parent = parent.parent
      }
      return <Script>parent
    }
    constructor(left : AST, right: AST) {
      this.left = left
      this.left.parent = this
      this.right = right
      this.right.parent = this
    }
    parse(t : Token, lex : Lexer) : [AST, Error] {
      console.log('Join shouldn\'t be parsing')
      return [this, null]
    }
    pop() : [AST, Error] {
      if (this.right === null) {
        return [null, Error.unexpectedToken]
      }
      let right = this.right
      this.right = null
      return [right, null]
    }
    push(ast : AST) : Error {
      if (this.right !== null) {
        return Error.unexpectedToken
      }
      this.right = ast
      ast.parent = this
      return null
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      console.log('Generic Join run')
      let st1 = await this.left.run(host, stdin, stdout, stderr)
      let st2 = await this.right.run(host, stdin, stdout, stderr)
      console.log('Join ended:', st1, st2)
      return st1 + st2
    }
  }
  class Pipe extends Join {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let rw = new ReadWriter()
      let left = this.left.run(host, stdin, rw, stderr)
      let right = this.right.run(host, rw, stdout, stderr)
      let status = await Promise.race([left, right])
      rw.close()
      return status
    }
  }
  class And extends Join {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let status = await this.left.run(host, stdin, stdout, stderr)
      if (status === 0) {
        status = await this.right.run(host, stdin, stdout, stderr)
      }
      return status
    }
  }
  class Or extends Join {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let status = await this.left.run(host, stdin, stdout, stderr)
      if (status !== 0) {
        status = await this.right.run(host, stdin, stdout, stderr)
      }
      return status
    }
  }
  class File extends ReadWriter {
    filename : string
    changed : (content : string) => void = null
    content : string = ''
    constructor(filename : string, content? : string, changed? : (content : string) => void) {
      super()
      this.filename = filename
      this.changed = changed
      if (content) {
        this.content = content
        super.write(content)
      }
    }
    write(s : string) : Error {
      let err = super.write(s)
      if (err !== null) {
        return err
      }
      this.content += s
      this.changed && this.changed(this.content)
      return null
    }
    clear() : Error {
      if (this.err !== null) {
        return this.err
      }
      this.content = ''
      this.changed && this.changed(this.content)
      return null
    }
  }
  global.FileStream = File
  class Write extends Join {
    clear = true
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let fnrw = new ReadWriter()
      let status = await this.right.run(host, stdin, fnrw, stderr)
      let rw = new ReadWriter()
      let [s, err] = fnrw.readSync()
      if (err !== null) {
        return -1
      }
      let file = this.findScript().getFile(s)
      if (this.clear) {
        err = file.clear()
        if (err !== null) {
          return -2
        }
      }
      status = await this.left.run(host, stdin, file, stderr)
      err = file.close()
      
      return status !== 0 ? status : (err === null ? 0 : 1)
    }
  }
  class Append extends Write {
    clear = false
  }
  class Read extends Join {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let fnrw = new ReadWriter()
      let status = await this.right.run(host, stdin, fnrw, stderr)
      let rw = new ReadWriter()
      let [s, err] = fnrw.readSync()
      if (err !== null) {
        return -1
      }
      let file = this.findScript().getFile(s)
      file.close()
      status = await this.left.run(host, file, stdout, stderr)
      
      return status !== 0 ? status : (err === null ? 0 : 1)
    }
  }
  class ReadStr extends Join {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let fnrw = new ReadWriter()
      let status = await this.right.run(host, stdin, fnrw, stderr)
      fnrw.close()
      status = await this.left.run(host, fnrw, stdout, stderr)
      
      return status
    }
  }
  let joinTokens : {[kind : number]: typeof Join} = {
    [TokenKind.lt]: Read,
    [TokenKind.ltltlt]: ReadStr,
    [TokenKind.gt]: Write,
    [TokenKind.gtgt]: Append,
    [TokenKind.pipe]: Pipe,
    [TokenKind.pipepipe]: Or,
    [TokenKind.ampamp]: And
  }
  let joinFile : {[kind : number]: boolean} = {
    [TokenKind.ltltlt]: true,
    [TokenKind.lt]: true,
    [TokenKind.gt]: true,
    [TokenKind.gtgt]: true
  }
  
  class Comment implements AST {
    kind = NodeKind.whitespace
    parent : AST = null
    constructor(parent : AST) {
      this.parent = parent
    }
    parse(t : Token, lex : Lexer) : [AST, Error] {
      if (t.kind === TokenKind.newline) {
        return this.parent.parse(t, lex)
      }
      return [this, null]
    }
    pop() : [AST, Error] {
      return [null, null]
    }
    push(ast : AST) : Error {
      return null
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      return 0
    }
  }
  
  class Command extends Sequence {
    joined : boolean = false
    paren : boolean = false
    parse(t : Token, lex : Lexer) : [AST, Error] {
      let command : Command
      let join : Join
      let parent : AST
      let sub : Sub
      switch (t.kind) {
        case TokenKind.newline:
          parent = this.parent
          while (parent !== null && !(parent instanceof Script)) {
            parent = parent.parent
          }
          if (parent === null) {
            return [null, Error.unknownError]
          }
          return [parent, null]
        case TokenKind.identifier:
          if (this.joined) {
            return [null, Error.unexpectedToken]
          }
          this.push(new Ident(t.value))
          return [this, null]
        case TokenKind.lparen:
          if (this.body.length !== 0) {
            return [null, Error.unexpectedToken]
          }
          command = new ParenCommand()
          this.push(command)
          let cmd = new Command()
          command.push(cmd)
          return [cmd, null]
        case TokenKind.rparen:
          parent = this.parent
          while (parent !== null && !((parent instanceof Command) && (<Command>parent).paren)) {
            parent = parent.parent
          }
          if (parent === null) {
            return [null, Error.unexpectedToken]
          }
          if (parent instanceof Sub) {
            return [parent.parent, null]
          }
          (<Command>parent).joined = true
          return [parent, null]
        case TokenKind.whitespace:
          if (this.body.length > 0 && (this.last()[0].kind & (NodeKind.ident | NodeKind.split)) !== 0) {
            this.push(new Whitespace(t.value))
          }
          return [this, null]
        case TokenKind.dol:
          let v = new Variable()
          this.push(v)
          return [v, null]
        case TokenKind.sub:
          sub = new Sub()
          this.push(sub)
          command = new Command()
          sub.push(command)
          return [command, null]
        case TokenKind.backtick:
          parent = this.parent
          while (parent !== null && !(parent instanceof Sub)) {
            parent = parent.parent
          }
          if (parent !== null) {
            return [parent.parent, null]
          }
          
          sub = new Sub()
          this.push(sub)
          command = new Command()
          sub.push(command)
          return [command, null]
        case TokenKind.quot:
          let q = new Quote()
          this.push(q)
          lex.scanOverride = Scanner.test.notQuot
          return [q, null]
        case TokenKind.dblquot:
          let dq = new DblQuote()
          this.push(dq)
          return [dq, null]
        case TokenKind.hash:
          return [new Comment(this), null]
      }
      if (!this.joined && this.body.length === 0) {
        return [null, Error.unexpectedToken]
      }
      if (joinTokens.hasOwnProperty(t.kind)) {
        let parent = this.parent
        let [_, err] = parent.pop()
        if (err !== null) {
          return [null, err]
        }
        command = (joinFile.hasOwnProperty(t.kind) ? new NotCommand() : new Command())
        join = new joinTokens[t.kind](this, command)
        parent.push(join)
        return [command, null]
      }
      return [this, Error.unknownToken]
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let rw = new ReadWriter()
      let oargs : {value : string, quoted : boolean}[] = []
      let status : number = 0
      let first = true
      let err : Error
      let args : string[] = []
      let arg = ''
      let last = NodeKind.whitespace
      for (let ast of this.body) {
        if (ast.kind === NodeKind.whitespace) {
          if (last !== NodeKind.whitespace) {
            args.push(arg)
            arg = ''
          }
          last = ast.kind
          continue
        }
        status = await ast.run(host, stdin, rw, stderr)
        let s : string
        [s, err] = rw.readSync()
        if (err !== null) {
          console.log('weird error reading from buffer')
        }

        if (ast.kind === NodeKind.ident) {
          arg += s
        } else {
          let split = s.split(/[\n \t\v]+/g)
          arg += split[0]
          for (let i = 1; i < split.length; i++) {
            args.push(arg)
            arg = split[i]
          }
        }
        last = ast.kind
      }
      if (last !== NodeKind.whitespace) {
        args.push(arg)
      }
      if (args.length > 0) {
        // console.log('Command resolved:', args, err ? Error[err] : '')
        let promise = host.exec(args, stdin, stdout, stderr)
        // promise.then((v) => console.log('finished in exec', v))
        promise.catch((v) => console.log('caught in exec', v))
        status = await promise
        // console.log('done awaiting in bashast', promise, status)
      }
      return status
    }
  }
  class NotCommand extends Command {
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let status : number
      let first = true
      for (let ast of this.body) {
        if (!first) {
          stdout.write(' ')
        } else {
          first = false
        }
        status = await ast.run(host, stdin, stdout, stderr)
      }
      return status
    }
  }
  class ParenCommand extends NotCommand {
    constructor() {
      super()
      this.paren = true
    }
  }
  class Script extends Command {
    getFile = (filename : string) : File => { return new File(filename) }
    constructor() {
      super()
    }
    parse(t : Token, lex : Lexer) : [AST, Error] {
      if (t.kind === TokenKind.whitespace) {
        return [this, null]
      }
      let command : AST = new Command()
      this.push(command)
      let err : Error
      [command, err] = command.parse(t, lex)
      return [command, err]
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      for (let ast of this.body) {
        await ast.run(host, stdin, stdout, stderr)
      }
      return 0
    }
  }
  global.Script = Script
  class Ident implements AST {
    kind = NodeKind.ident
    parent : AST = null
    text : string
    constructor(text : string) {
      this.text = text
    }
    // these methods should probably never be called on an Ident.. I think?
    parse(t : Token, lex : Lexer) : [AST, Error] {
      return [this, Error.unknownError]
    }
    pop() : [AST, Error] {
      return [null, Error.unknownError]
    }
    push(ast : AST) : Error {
      if (ast.kind === NodeKind.ident) {
        this.text = (<Ident>ast).text
        return null
      }
      return Error.unknownError
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      stdout.write(this.text)
      return 0
    }
  }
  class Whitespace extends Ident {
    kind = NodeKind.whitespace
    constructor(text : string) {
      super(text)
    }
  }
  class Quote extends Ident {
    kind = NodeKind.ident
    joined = false
    constructor() {
      super('')
    }
    parse(t : Token, lex : Lexer) : [AST, Error] {
      this.text = t.value
      return [this.parent, null]
    }
  }
  class DblQuote extends Sequence {
    kind = NodeKind.ident
    joined = false
    parse(t : Token, lex : Lexer) : [AST, Error] {
      let sub : Sub
      let command : Command
      switch (t.kind) {
        case TokenKind.dblquot:
          return [this.parent, null]
        case TokenKind.dol:
          let v = new Variable()
          this.push(v)
          return [v, null]
        case TokenKind.sub:
          sub = new Sub()
          sub.kind = NodeKind.ident
          this.push(sub)
          command = new Command()
          sub.push(command)
          return [command, null]
        case TokenKind.backtick:
          let parent = this.parent
          while (parent !== null && !(parent instanceof Sub)) {
            parent = parent.parent
          }
          if (parent !== null) {
            return [parent.parent, null]
          }
          
          sub = new Sub()
          sub.kind = NodeKind.ident
          this.push(sub)
          command = new Command()
          sub.push(command)
          return [command, null]
        default:
          this.push(new Ident(t.value))
          return [this, null]
      }
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let status : number
      for (let ast of this.body) {
        status = await ast.run(host, stdin, stdout, stderr)
      }
      return status
    }
  }
  class Variable implements AST {
    kind = NodeKind.split
    parent : AST = null
    ident = ''
    constructor() {
    }
    parse(t : Token, lex : Lexer) : [AST, Error] {
      if (t.kind === TokenKind.identifier) {
        this.ident += t.value
        let tested = /^[0-9a-zA-Z_]+/.exec(this.ident)
        if (tested === null) {
          return this.parent.parse({
            kind: TokenKind.identifier,
            value: '$' + t.value
          }, lex)
        }
        if (tested[0].length < this.ident.length) {
          let ident = this.ident.substring(tested[0].length)
          this.ident = tested[0]
          return this.parent.parse({
            kind: TokenKind.identifier,
            value: ident
          }, lex)
        }
        return [this, null]
      }
      if (this.ident === '') {
        this.parent.pop()
        let [ast, err] = this.parent.parse({
          kind: TokenKind.identifier,
          value: '$'
        }, lex)
        if (err !== null) {
          return [ast, err]
        }
        return ast.parse(t, lex)
      }
      return this.parent.parse(t, lex)
    }
    pop() : [AST, Error] {
      return [null, Error.unknownError]
    }
    push() : Error {
      return Error.unknownError
    }
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      stdout.write(host.env(this.ident))
      return 0
    }
  }
  class Sub extends NotCommand {
    kind = NodeKind.split
    paren = true
    async run(host : Host, stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> {
      let status : number
      let rw = new ReadWriter()
      for (let ast of this.body) {
        status = await ast.run(host, stdin, rw, stderr)
      }
      let [str, err] = rw.readSync()
      stdout.write(str[str.length - 1] === '\n' ? str.substring(0, str.length - 1) : str)
      return status
    }
  }
  
  class Parser {
    lexer : Lexer
    constructor(l : Lexer) {
      this.lexer = l
    }
    async parse() : Promise<[Script, Error]> {
      let script = new Script()
      let ctx : AST = script
      let last : AST = null
      let tok : Token = null
      let err : Error = null
      
      while (err === null) {
        [tok, err] = await this.lexer.next()
        if (err !== null) {
          break
        }
        [ctx, err] = await ctx.parse(tok, this.lexer)
      }
      /*if (ctx && ctx !== script && ctx.parent.parent !== script && ctx.parent !== script && (err === null || err === Error.eof || err === Error.closed)) {
        console.log(ctx, 'wrong eof')
        err = Error.unexpectedEof
      }*/
      console.log(ctx)
      if (err === Error.eof) {
        // EOF is expected here
        err = null
      }
      return <[Script, Error]>[script, err]
    }
    static async Parse(input : Reader, lex : Lexer) : Promise<[Script, Error]> {
      let s = new Scanner(input)
      let l = new Lexer(s)
      let p = new Parser(l)

      return p.parse()
    }
    static async ParseString(input : string) : Promise<[Script, Error]> {
      let r = new ReadWriter()
      r.write(input)
      r.close()
      let s = new Scanner(r)
      let l = new Lexer(s)
      let p = new Parser(l)
      
      return p.parse()
    }
    static async debug(input : string) {
      let [s, err] = await this.ParseString(input)
      console.log('AST:', s)
      s.run({
        exec: async (args : string[], stdin : Reader, stdout : Writer, stderr : Writer) : Promise<number> => {
          console.log('executed:', args)
          stdout && stdout.write('<result of ' + args.join(';') + '>')
          return 0
        },
        env: (name : string) : string => {
          console.log('resolved var:', name)
          return 'some_' + name + '_var'
        }
      }, null, null, null)
    }
  }
  global.Parser = Parser
})(window)