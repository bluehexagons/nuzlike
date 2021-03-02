/// <reference path='monsters.ts'/>
;(() => {
  'use strong'
  let tileSize = 48 * devicePixelRatio
  let tickTime = 1000 / 60
  let tickRate = 1 / tickTime
  let m = Monsters.get()
  let map = function<T>(o : any) : Map<string, T> {
    if (!o) {
      return new Map<string, T>()
    }
    let keys = Object.keys(o)
    let m = new Map<string, T>()
    for (let key of keys) {
      m.set(key, o[key])
    }
    return m
  }
  interface Context2D extends CanvasRenderingContext2D {
    imageSmoothingEnabled : boolean
  }
  let loaded = 0
  let assetLoaded = (e : Event) => {
    loaded--
    console.log('loading', loaded)
    e.target.removeEventListener('canplaythrough', assetLoaded)
    if (loaded === 0) {
      init()
    }
  }

  let sounds = [
    'step step.ogg 30%',
    'back back.wav 70%',
    'move move.wav 70%',
    'pick pick.wav 70%',
    'blab blab.wav 70%',
  ].reduce((m : Map<string, HTMLAudioElement>, name : string) => {
    let split = name.split(' ')
    let aud = new Audio('sfx/' + split[1])
    m.set(split[0], aud)
    if (split.length > 2) {
      console.log(split, split[2])
      aud.volume = parseInt(split[2], 10) / 100
    }
    loaded++
    aud.addEventListener('canplaythrough', assetLoaded);
    return m
  }, new Map<string, HTMLAudioElement>())
  let playSfx = (name : string) => {
    if (!sounds.has(name)) {
      console.error('SFX not found!', name)
      return
    }
    // temporary solution
    sounds.get(name).currentTime = 0
    sounds.get(name).play()
  }

  let images = [
    'sheet medstrat.png',
    'tiles hyptosis_tiles.png',
    'gal gal.png',
    'guy guy.png',
  ].reduce((m : Map<string, HTMLImageElement>, name : string) => {
    let img = new Image()
    img.src = 'img/' + name.split(' ')[1]
    m.set(name.split(' ')[0], img)
    if (!img.complete) {
      loaded++
      img.addEventListener('load', assetLoaded)
    }
    return m
  }, new Map<string, HTMLImageElement>())

  class Frame {
    image : HTMLCanvasElement
    duration : number
  }

  let sprites = new Map<string, Sprite>()
  class Sprite {
    name : string
    image : HTMLCanvasElement = null
    sheet = false
    animated = false
    animating = false
    frame = 0
    start = 0
    elapsed = 0
    next = 0
    frames : Frame[] = null
    duration = 0
    loop = true
    constructor(name : string) {
      this.name = name
    }
    init() {
      if (this.frames !== null) {
        let d = 0
        for (let i = 0; i < this.frames.length; i++) {
          d += this.frames[i].duration
        }
        this.duration = d
      }
    }
    progress(t : number) {
      return Math.min((t - this.start + this.elapsed) / this.duration, 1)
    }
    reset(t : number) {
      this.animated = true
      this.frame = 0
      this.elapsed = 0
      this.start = t
    }
    animate(t : number) {
      if (this.frames === null) {
        return
      }
      if (!this.animating) {
        this.start = t
        this.animating = true
      }
      let f = this.frames[this.frame]
      while (t >= this.start + f.duration) {
        this.start += f.duration
        this.elapsed += f.duration
        this.frame++
        if (this.frame === this.frames.length) {
          if (!this.loop) {
            this.animated = false
            this.frame--
            break
          } else {
            this.elapsed = 0
            this.frame = 0
          }
        }
        f = this.frames[this.frame]
      }
      this.next = this.start + f.duration
      if (!this.sheet) {
        this.image = this.frames[this.frame].image
      }
    }
  }
  let makeSprite = (name : string, start : number) : Sprite => {
    if (!sprites.has(name)) {
      let s = new Sprite(name)
      s.image = document.createElement('canvas')
      s.image.width = tileSize
      s.image.height = tileSize
      let ctx = s.image.getContext('2d') as Context2D
      ctx.imageSmoothingEnabled = false
      // console.log('made new', name)
      console.assert(images.has(name), 'Image not found: ' + name)
      ctx.drawImage(images.get(name), 0, 0, tileSize, tileSize)
      return s
    } else if (sprites.get(name).animated) {
      let s = new Sprite(name)
      let c = sprites.get(name)
      // console.log('animated', name)
      s.image = c.image
      s.frames = c.frames
      s.animated = c.animated
      s.frame = 0
      s.sheet = c.sheet
      s.loop = c.loop
      s.duration = c.duration
      s.start = start
      return s
    }
    // console.log('from sprites', name)
    return sprites.get(name)
  }

  class Sheet {
    cellSize : number
    width : number
    image : HTMLCanvasElement
    sprites : string[]
    name : string
    constructor(cs : number, w : number, img : string, sprites : string[]) {
      this.cellSize = cs
      this.width = w
      this.name = img
      this.sprites = sprites
    }
    init() {
      this.image = document.createElement('canvas')
      console.assert(images.has(this.name), 'Image not found: ' + this.name)
      let img = images.get(this.name)
      this.image.width = img.width
      this.image.height = img.height
      let ctx = this.image.getContext('2d') as Context2D
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      let offset = 0

      for (let i = 0; i < this.sprites.length; i++) {
        let name = this.sprites[i]
        let parts = name.split(',')
        let split = parts[0].split(' ')
        let sprite = new Sprite(split[0])
        let canvas = document.createElement('canvas')
        canvas.width = tileSize
        canvas.height = tileSize
        ctx = canvas.getContext('2d') as Context2D
        ctx.imageSmoothingEnabled = false
        sprite.image = canvas
        let frames : number[] = []
        if (parts.length > 1) {
          frames = parts[1].split(' ').map(s => +s)
        }
        
        let args : string[] = []
        let set : string[] = []
        for (let i = 1; i < split.length; i++) {
          if (split[i].indexOf('=') !== -1) {
            set.push(split[i])
          } else {
            args.push(split[i])
          }
        }

        let x = 0
        let y = 0
        if (args.length === 0) {
          x = (i + offset) % this.width
          y = (i + offset) / this.width | 0
        } else if (args.length === 1) {
          x = (i + offset) % this.width
          y = (i + offset) / this.width | 0
          sprite.animated = true
          sprite.frames = []
          let j = i + offset
          let l = parseInt(args[0], 10)
          offset += l - 1
          for (let n = 0; n < l; n++, j++) {
            let canvas = document.createElement('canvas')
            canvas.width = tileSize
            canvas.height = tileSize
            let ctx = canvas.getContext('2d') as Context2D
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(this.image,
              (j % this.width) * this.cellSize,
              (j / this.width | 0) * this.cellSize,
              this.cellSize,
              this.cellSize,
              0,
              0,
              tileSize,
              tileSize
            )
            let d = 333
            if (frames.length > 0) {
              d = frames[n]
            }
            sprite.frames.push({
              image: canvas,
              duration: d
            })
          }
        } else if (args.length === 2) {
          x = parseInt(args[0], 10)
          y = parseInt(args[1], 10)
        } else if (args.length === 3) {
          x = parseInt(args[0], 10)
          y = parseInt(args[1], 10)
          sprite.animated = true
          sprite.frames = []
          let j = y * this.width + x
          let l = parseInt(args[2], 10)
          for (let n = 0; n < l; n++, j++) {
            let canvas = document.createElement('canvas')
            canvas.width = tileSize
            canvas.height = tileSize
            let ctx = canvas.getContext('2d') as Context2D
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(this.image,
              (j % this.width) * this.cellSize,
              (j / this.width | 0) * this.cellSize,
              this.cellSize,
              this.cellSize,
              0,
              0,
              tileSize,
              tileSize
            )
            let d = 333
            if (frames.length > 0) {
              d = frames[n]
            }
            sprite.frames.push({
              image: canvas,
              duration: d
            })
          }
        }
        ctx.drawImage(this.image, x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize, 0, 0, tileSize, tileSize)
        sprite.init()
        sprites.set(split[0], sprite)
      }
    }
  }
  // sprite list can have one of two formats:
  // 'name animationFrames?' or 'name x y animationFrames?'
  let sheets = map<Sheet>({
    'sheet': new Sheet(16, 7, 'sheet', [
      'trees 4 0',
      'water 0 24',
      'water2 0 24 4',
      'windmill 3 23 4,500 500 500 500',
      'treetest 4 0 3',
      'crate 6 5',
      'rubble 6 30',
      'fire 0 33 2'
    ]),
    'tiles': new Sheet(32, 24, 'tiles', [
      'grass',
      'blank 2 1',
      'rough 5 1',
      'tree 8 0',
      'rock 10 6',
      'tallshrub_top 11 8',
      'tallshrub_bottom 11 9',
      'smallplant 14 9',
      'palm_top 15 8',
      'palm_bottom 15 9',
    ]),
    'guy': new Sheet(64, 4, 'guy', [
      'guy_w_down 4,50 150 100 150',
      'guy_w_left 4,50 150 100 150',
      'guy_w_right 4,50 150 100 150',
      'guy_w_up 4,50 150 100 150',
      'guy_down 0 0,150 150 150 150',
      'guy_left 0 1,150 150 150 150',
      'guy_right 0 2,150 150 150 150',
      'guy_up 0 3,150 150 150 150',
    ]),
    'gal': new Sheet(64, 4, 'gal', [
      'gal_w_down 4,50 150 100 150',
      'gal_w_left 4,50 150 100 150',
      'gal_w_right 4,50 150 100 150',
      'gal_w_up 4,50 150 100 150',
      'gal_down 0 0,150 150 150 150',
      'gal_left 0 1,150 150 150 150',
      'gal_right 0 2,150 150 150 150',
      'gal_up 0 3,150 150 150 150',
    ])
  })

  let drawSprite = (t : number, ctx : CanvasRenderingContext2D, sprite : Sprite[]) => {
    for (let i = 0; i < sprite.length; i++) {
      let s = sprite[i]
      if (s.animated) {
        let f = s.frames[s.frame] as Frame
        s.animate(t)
      }
      ctx.drawImage(s.image, 0, 0, 1, 1)
    }
  }

  let bgSyncTime = Date.now()
  let bgCache = new Map<string, HTMLCanvasElement>()
  let getBG = (bg : Sprite[]) : HTMLCanvasElement => {
    let name = bg.map(o => o['name']).join(':')
    if (bgCache.has(name)) {
      return bgCache.get(name)
    }
    let canvas = document.createElement('canvas')
    canvas.width = tileSize
    canvas.height = tileSize
    let ctx = canvas.getContext('2d') as Context2D
    ctx.imageSmoothingEnabled = false
    ctx.scale(tileSize, tileSize)
    drawSprite(bgSyncTime, ctx, bg)
    bgCache.set(name, canvas)
    console.log('cached new background', name)
    return canvas
  }
  let mergeCache = new Map<string, Sprite>()
  let mergeSprites = (sprites : Sprite[]) : Sprite => {
    let name = sprites.map(o => o['name']).join(':')
    if (mergeCache.has(name)) {
      return mergeCache.get(name)
    }
    let sprite = new Sprite(name)
    let canvases : HTMLCanvasElement[] = []
    let synced = false
    let t = bgSyncTime
    sprite.reset(t)
    let frames : Frame[] = []
    let tries = 0
    while (tries < 16) {
      let canvas = document.createElement('canvas')
      canvas.width = tileSize
      canvas.height = tileSize
      let ctx = canvas.getContext('2d') as Context2D
      ctx.imageSmoothingEnabled = false
      ctx.scale(tileSize, tileSize)
      drawSprite(t, ctx, sprites)
      canvases.push(canvas)
      let next = Infinity
      synced = true
      for (let i = 0; i < sprites.length; i++) {
        let s = sprites[i]
        if (s.animated) {
          if (s.next < next) {
            next = s.next
          }
          if (s.frame !== 0) {
            synced = false
          }
        }
      }
      if (tries > 0 && synced) {
        break
      }
      for (let i = 0; i < sprites.length; i++) {
        let s = sprites[i]
        if (s.animated) {
          s.animate(t)
        }
      }

      frames.push({
        image: canvas,
        duration: next - t
      })
      console.log('next in', next - t)
      t = next
      tries++
    }
    if (tries >= 16) {
      console.log('animation descyned:', name)
    }
    let canvas = document.createElement('canvas')
    canvas.width = canvases.length * tileSize
    canvas.height = tileSize
    let ctx = canvas.getContext('2d') as Context2D
    ctx.imageSmoothingEnabled = false
    for (let i = 0; i < canvases.length; i++) {
      ctx.drawImage(canvases[i], i * tileSize, 0)
    }
    sprite.frames = frames
    sprite.image = frames[0].image
    sprite.next = t + frames[0].duration
    mergeCache.set(name, sprite)
    console.log('cached new animated background', name)
    return sprite
  }

  let isAnimated = (sprites : Sprite[]) : boolean => {
    for (let i = 0; i < sprites.length; i++) {
      if (sprites[i].animated) {
        return true
      }
    }
    return false
  }
  let soonestTick = (sprites : Sprite[]) : number => {
    if (sprites.length === 0) {
      return Infinity
    }
    let soonest = Infinity
    for (let i = 0; i < sprites.length; i++) {
      if (sprites[i].animated && sprites[i].next < soonest) {
        soonest = sprites[i].next
      }
    }
    return soonest
  }
  let now = bgSyncTime
  class Cell {
    bgAnim : Sprite = null
    bgSprites : Sprite[] // considered safe to cache
    fgSprites : Sprite[] // not safe to cache
    olSprites : Sprite[] = [] // overlay sprites.. they should point to bg if animated, only drawn if fg or sprite over
    updated = true
    dirty = true
    bg : HTMLCanvasElement = null
    img : HTMLCanvasElement = null
    ctx : Context2D = null
    initialized = false
    animated = false
    nextTick = Infinity
    nextKind = false
    passable = true
    entity : Entity = null
    refresh() {
      let nextTick = this.nextTick
      if (this.bgAnim !== null) {
        let bg = this.bgAnim.next
        let fg = soonestTick(this.fgSprites)
        this.nextKind = bg <= fg
        this.nextTick = Math.min(bg, fg)
      } else {
        this.nextKind = false
        this.nextTick = soonestTick(this.fgSprites)
      }
      this.updated = true
      this.animated = isAnimated(this.bgSprites) || isAnimated(this.fgSprites)
    }
    addSprite(s : Sprite, reference? : number) {

    }
    update(t : number) {
      if (this.bgAnim !== null && this.nextKind) {
        this.bgAnim.animate(t)
        this.bg = this.bgAnim.image
      }
      if (this.ctx === null && this.fgSprites.length > 0) {
        this.img = document.createElement('canvas')
        this.img.width = tileSize
        this.img.height = tileSize
        this.ctx = this.img.getContext('2d') as Context2D
        this.ctx.imageSmoothingEnabled = false
        this.ctx.scale(tileSize, tileSize)
      }
      if (this.ctx !== null) {
        this.ctx.drawImage(this.bg, 0, 0, 1, 1)
        drawSprite(t, this.ctx, this.fgSprites)
        drawSprite(t, this.ctx, this.olSprites)
      } else if (this.bgAnim !== null) {
        this.img = this.bg
      }
      this.refresh()
      this.updated = false
    }
    constructor(bg : Sprite[], fg : Sprite[]) {
      this.bgSprites = bg
      this.fgSprites = fg || []
    }
    init() {
      if (isAnimated(this.bgSprites)) {
        this.bgAnim = mergeSprites(this.bgSprites)
        this.bg = this.bgAnim.image
      } else {
        this.bg = getBG(this.bgSprites)
      }

      this.refresh()

      if (this.fgSprites.length === 0) {
        this.img = this.bg
        return
      }
      this.img = document.createElement('canvas')
      this.img.width = tileSize
      this.img.height = tileSize
      let ctx = this.img.getContext('2d') as Context2D
      this.ctx = ctx
      ctx.imageSmoothingEnabled = false
      ctx.scale(tileSize, tileSize)
      ctx.drawImage(this.bg, 0, 0, 1, 1)
      drawSprite(now, ctx, this.fgSprites)
      this.initialized = true
    }
  }
  
  interface Entity {
    sprites : Sprite[]
    paint : boolean
    x : number
    y : number
    w : number
    h : number
    tick : (t : number) => void
    draw : (t : number) => void
    interact : (t : number) => void
    init : () => void
  }
  
  let player_actions = map<(p : Player, t : number) => void>({
    'up:down': (p : Player, t : number) => {
      p.movePress('up', t)
    },
    'up': (p : Player, t : number) => {
      p.move('up', t)
    },
    'left:down': (p : Player, t : number) => {
      p.movePress('left', t)
    },
    'left': (p : Player, t : number) => {
      p.move('left', t)
    },
    'down:down': (p : Player, t : number) => {
      p.movePress('down', t)
    },
    'down': (p : Player, t : number) => {
      p.move('down', t)
    },
    'right:down': (p : Player, t : number) => {
      p.movePress('right', t)
    },
    'right': (p : Player, t : number) => {
      p.move('right', t)
    },
    'interact:down': (p : Player, t : number) => {
      if (p.moving) {
        return
      }
      let cell = area.cellAt(p.x + dMap[p.facing][0], p.y + dMap[p.facing][1])
      if (cell !== null && cell.entity !== null && cell.entity.interact !== null) {
        console.log(cell.entity, cell.entity.interact)
        cell.entity.interact(t)
      }
    },
  })
  let dMap : {[prop : string]: [number, number]} = {
    'up': [0, -1],
    'left': [-1, 0],
    'down': [0, 1],
    'right': [1, 0],
  }
  class Player implements Entity {
    sprites : Sprite[]
    paint : boolean = false
    x : number
    y : number
    cx : number
    cy : number
    dx : number
    dy : number
    w : number = 1
    h : number = 1
    sprite : string
    facing : string
    turned = false
    moving = false
    cell : Cell
    cutoff = 0
    lastSprite = ''
    queueTurn = ''
    step = false
    constructor(x : number, y : number) {
      this.x = this.cx = this.dx = x
      this.y = this.cy = this.dy = y
    }
    setSprite(s : string) {
      if (s === this.lastSprite) {
        return
      }
      this.lastSprite = s
      this.sprites[0] = makeSprite(s, now)
      if (!this.paint) {
        this.cell.fgSprites.length = this.cutoff
        this.cell.fgSprites.push(...this.sprites)
        this.cell.refresh()
      }
    }
    movePress(direction : string, t : number) {
      if (this.moving) {
        return
      }
      this.turned = this.facing !== direction
      this.facing = direction
      this.setSprite(this.sprite + '_' + this.facing)
      // console.log('turning toward', direction, this.turned, this.sprite + '_' + this.facing)
    }
    move(direction : string, t : number) {
      if (this.moving) {
        this.queueTurn = direction
        return
      }
      if (this.turned) {
        if (t - (held.get(direction) || t) < 100) {
          return
        }
        this.turned = false
      }
      this.dx = this.x + dMap[direction][0]
      this.dy = this.y + dMap[direction][1]
      let dest = area.cellAt(this.dx, this.dy)
      this.facing = direction
      if (dest === null || !dest.passable) {
        if (this.paint) {
          let cell = area.cellAt(this.x, this.y)
          this.cell = cell
          this.cutoff = this.cell.fgSprites.length
          this.paint = false
          cell.fgSprites.push(...this.sprites)
        }
        this.setSprite(this.sprite + '_' + this.facing)
        return
      }
      if (!this.paint) {
        this.paint = true
        this.cell.refresh()
        this.cell.fgSprites.length = this.cutoff
        this.cell = null
      }
      this.setSprite(this.sprite + '_w_' + this.facing)
      this.step = this.sprites[0].progress(t) >= 0.5
      this.sprites[0].loop = false
      this.moving = true
    }
    tick = (t : number) => {
      this.queueTurn = ''
      for (let i = 0; i < actions.length; i++) {
        if (player_actions.has(actions[i])) {
          player_actions.get(actions[i])(this, t)
        }
      }
      // console.log(this.sprites[0].progress(t))
      if (this.moving && this.sprites[0].progress(t) >= (this.step ? 1 : 0.5)) {
        this.x = this.cx = this.dx
        this.y = this.cy = this.dy
        this.moving = false

        playSfx('step')
        if (this.queueTurn) {
          if (this.sprites[0].progress(t) === 1) {
            this.sprites[0].reset(t)
          }
          this.move(this.queueTurn, t)
          return
        } else {
          if (this.sprites[0].progress(t) === 1) {
            this.sprites[0].reset(t)
          }
        }
        if (this.paint) {
          let cell = area.cellAt(this.x, this.y)
          this.cell = cell
          this.cutoff = this.cell.fgSprites.length
          this.paint = false
          cell.fgSprites.push(...this.sprites)
        }
        this.setSprite(this.sprite + '_' + this.facing)
      }
    }
    draw = (t : number) => {
      if (this.moving) {
        let progress = this.sprites[0].progress(t)
        if (this.step) {
          progress = (progress - 0.5) * 2
        } else {
          progress *= 2
        }
        if (this.queueTurn !== this.facing) {
          progress = Math.min(progress, 1)
        }
        this.x = this.cx + (this.dx - this.cx) * progress
        this.y = this.cy + (this.dy - this.cy) * progress
      }
    }
    interact : (t : number) => void
    init() {
      let cell = area.cellAt(this.x, this.y)
      this.cell = cell
      this.cutoff = this.cell.fgSprites.length
      this.sprite = Math.random() < 0.5 ? 'gal' : 'gal'
      this.facing = 'down'
      this.sprites = [makeSprite(this.sprite + '_' + this.facing, now)]
      cell.fgSprites.push(...this.sprites)
    }
  }

  class Interactable implements Entity {
    sprites : Sprite[] = null
    paint : boolean = false
    x : number = 0
    y : number = 0
    w : number = 0
    h : number = 0
    tick : (t : number) => void = null
    draw : (t : number) => void = null
    interact : (t : number) => void = (t : number) => {
      dialog('heyyyy default', null)
    }
    cell : Cell = null
    init : () => void = null
  }

  class Billboard extends Interactable {
    text : string
    interact : (t : number) => void = (t : number) => {
      dialog(this.text, null)
    }
    constructor(s : string) {
      super()
      this.text = s
    }
  }
  let cutTree = (i : number, s : string, e : Entity) => {
    if (i === 0) {
      let tree = <CuttableTree>e
      tree.cell.fgSprites.length = 0
      tree.cell.passable = true
      tree.cell.entity = null
      tree.cell.update(now)
    }
  }
  class CuttableTree extends Interactable {
    interact : (t : number) => void = (t : number) => {
      dialog('This is a small tree that looks like it can be cut.\nDo you want to cut down this tree?', {
        choice: ['YES', 'NO'],
        callback: cutTree,
        target: this
      })
    }
    constructor(c : Cell) {
      super()
      this.cell = c
    }
    init = () => {
      this.cell.fgSprites.push(makeSprite('tree', now))
      this.cell.passable = false
    }
  }

  class Area {
    cells : Array<Cell>
    width = 0
    height = 0
    bgSprites : Sprite[]
    bg : HTMLCanvasElement = null
    entities : Entity[] = []
    hidden : Map<number, string>
    cellAt(x : number, y : number) : Cell {
      if (x >= this.width || x < 0 || y >= this.height || y < 0) {
        return null
      }
      return this.cells[y * this.width + x]
    }
    constructor(bg : Sprite[]) {
      this.bgSprites = bg
    }
    init() {
      this.bg = getBG(this.bgSprites)
      let player = new Player(5, 5)
      player.init()
      camera.follow = player
      this.entities.push(player)
    }
  }

  let area : Area

  let camera = {
    x: 9,
    y: 9,
    width: 21,
    height: 14,
    follow: null as Entity,
  }

  let actions : string[] = []
  let held = new Map<string, number>()
  let bindings = map<string>({
    'w': 'up',
    'a': 'left',
    's': 'down',
    'd': 'right',
    'e': 'interact',
    'Enter': 'interact',
    'Tab': 'back',
    'Backspace': 'back',
    'Escape': 'menu',
    't': 'test',
  })

  let dirty = true
  let updateCanvas : () => void
  let start = 0
  let skip = 0
  let frame = 0
  let tickNow = 0
  let dialog : (text : string, options : { [s : string]: any }) => void = null
  let render = (() => {
    let canvas = document.createElement('canvas')
    document.body.style.margin = '0px'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    let density = devicePixelRatio
    updateCanvas = () => {
      canvas.width = canvas.offsetWidth * density
      canvas.height = canvas.offsetHeight * density

      ctx.imageSmoothingEnabled = false
      ctx.translate((canvas.width - camera.width * tileSize) / 2, (canvas.height - camera.height * tileSize) / 2)
      ctx.scale(tileSize, tileSize)
    }
    // is there a more idiomatic way to do this?
    let ctx = canvas.getContext('2d') as Context2D
    document.body.appendChild(canvas)
    let tick = 0
    console.log('started')
    let sum = (o : number, n : number) : number => {
      return o + n
    }
    let min = (o : number, n : number) : number => {
      return Math.min(o, n)
    }
    let max = (o : number, n : number) : number => {
      return Math.max(o, n)
    }
    let times = new Float64Array(300)

    let paintMons = () => {

    }
    let battleScene = () => {
      paintMons()
      requestAnimationFrame(render)
    }

    let lines : string[] = []
    let choice : string[] = ['YES', 'NO']
    let choiceWidth = 0
    let dialogTarget : Entity = null
    let dialogCallback : (i : number, s : string, e : Entity) => void = null
    let selected = 0
    let line = 0
    let pageOffset = 0
    let pageLines = 3
    let writtenIndex = 0
    let writtenWidth = 0
    let textDelay = 7
    let lastWrote = 0
    let fontSize = tileSize * 0.7 | 0
    let lineSize = tileSize * 0.75 | 0
    let textTime = 0
    let animating = true
    let paintMore = () => {
      if (line < lines.length) {
        ctx.fillStyle = 'rgb(28, 28, 28)'
        ctx.fillRect(camera.width - 0.5, camera.height - 0.5, 0.2, 0.2)
      } else if (choice !== null) {
        // choice at the end of the dialog
        selected = 0
        ctx.strokeStyle = 'rgb(55, 55, 55)'
        ctx.lineWidth = 0.1
        ctx.fillStyle = 'rgb(230, 230, 230)'
        ctx.save()
        ctx.scale(1 / tileSize, 1 / tileSize)
        ctx.strokeRect(camera.width * tileSize - choiceWidth - 2.5, (camera.height - 5.6) * tileSize, choiceWidth, choice.length * fontSize + 0.4)
        ctx.fillRect(camera.width * tileSize - choiceWidth - 2.5, (camera.height - 5.6) * tileSize, choiceWidth, choice.length * fontSize + 0.4)
        ctx.font = fontSize + 'px sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillStyle = 'rgb(28, 28, 28)'
        for (let i = 0; i < choice.length; i++) {
          ctx.fillText(choice[i], camera.width * tileSize - choiceWidth + 7.5, i * fontSize + (camera.height - 5.5) * tileSize - 5)
        }
        ctx.restore()
        paintSelect()
      }
    }
    let paintSelect = () => {
      ctx.save()
      ctx.scale(1 / tileSize, 1 / tileSize)
      let bx = camera.width * tileSize - choiceWidth
      let by = selected * fontSize + (camera.height - 5.5) * tileSize + (fontSize * 0.5) - 5
      ctx.fillStyle = 'rgb(230, 230, 230)'
      ctx.fillRect(bx - 1, (camera.height - 5.6) * tileSize, 10, choice.length * fontSize + 0.4)
      ctx.fillStyle = 'rgb(33, 33, 33)'
      ctx.beginPath()
      ctx.moveTo(bx, by - 5)
      ctx.lineTo(bx, by + 5)
      ctx.lineTo(bx + 7.5, by)
      ctx.fill()
      ctx.restore()
    }
    let nextBlab = 0
    let blabDelay = 100
    let textScene = () => {
      now = Date.now() - skip
      for (let i = 0; i < actions.length; i++) {
        if (actions[i] === 'interact:down' || actions[i] === 'back:down') {
          if (animating) {
            ctx.save()
            ctx.scale(1 / tileSize, 1 / tileSize)
            ctx.font = fontSize + 'px sans-serif'
            ctx.textBaseline = 'top'
            ctx.fillStyle = 'rgb(28, 28, 28)'
            ctx.fillText(lines[line].substr(writtenIndex), (1 * tileSize) + writtenWidth, (camera.height - 2.5) * tileSize + lineSize * (line - pageOffset))
            line++
            while (line < lines.length && line - pageOffset < pageLines) {
              ctx.fillText(lines[line], (1 * tileSize), (camera.height - 2.5) * tileSize + lineSize * (line - pageOffset))
              line++
            }
            animating = false
            ctx.restore()
            paintMore()
          } else if (line < lines.length) {
            animating = true
            pageOffset += pageLines
            writtenWidth = 0
            writtenIndex = 0
            lastWrote = now
            nextBlab = now + blabDelay
            ctx.fillStyle = 'rgb(230, 230, 230)'
            ctx.fillRect(0.1, camera.height - 2.6, camera.width - 0.2, 2.5)
          } else {
            // selected a choice
            skip += now - textTime
            render = mapScene
            dirty = true
            if (dialogCallback !== null) {
              if (choice !== null) {
                dialogCallback(selected, choice[selected], dialogTarget)
              } else {
                dialogCallback(-1, '', dialogTarget)
              }
            }
            actions.length = 0
            requestAnimationFrame(render)
            playSfx('pick')
            return
          }
          playSfx('move')
          break
        } else if (!animating && choice !== null) {
          if (actions[i] === 'up:down') {
            selected--
            if (selected < 0) {
              selected = choice.length + selected
            }
            paintSelect()
            playSfx('move')
          } else if (actions[i] === 'down:down') {
            selected = (selected + 1) % choice.length
            paintSelect()
            playSfx('move')
          }
        }
      }
      actions.length = 0
      requestAnimationFrame(render)
      if (animating) {
        let n = (now - lastWrote) / textDelay | 0
        if (n === 0) {
          return
        }
        lastWrote += n * textDelay
        if (writtenIndex < lines[line].length) {
          let s = lines[line].substr(writtenIndex, n)
          ctx.save()
          ctx.scale(1 / tileSize, 1 / tileSize)
          ctx.font = fontSize + 'px sans-serif'
          ctx.textBaseline = 'top'
          ctx.fillStyle = 'rgb(28, 28, 28)'
          ctx.fillText(s, (1 * tileSize) + writtenWidth, (camera.height - 2.5) * tileSize + lineSize * (line - pageOffset))
          writtenWidth += ctx.measureText(s).width
          writtenIndex += n
          ctx.restore()
        } else {
          writtenIndex = 0
          writtenWidth = 0
          line++
        }
        if (line >= lines.length || line - pageOffset >= pageLines) {
          animating = false
          paintMore()
        }
        if (now > nextBlab) {
          playSfx('blab')
          nextBlab += blabDelay
        }
      }
    }
    let wordsre = /[^ -]+[ -]*/g
    interface DialogOptions {
      choice? : string[]
      callback? : (i : number, s : string) => void
      target? : Entity
    }
    let dialogSetup = () => {
      now = Date.now() - skip
      paintMap()
      textTime = now
      ctx.strokeStyle = 'rgb(55, 55, 55)'
      ctx.lineWidth = 0.1
      ctx.strokeRect(0.1, camera.height - 2.6, camera.width - 0.2, 2.5)
      ctx.fillStyle = 'rgb(230, 230, 230)'
      ctx.fillRect(0.1, camera.height - 2.6, camera.width - 0.2, 2.5)
      writtenIndex = 0
      writtenWidth = 0
      animating = true
      pageOffset = 0

      line = 0
      lastWrote = now

      render = textScene
      nextBlab = now
      textScene()
    }
    dialog = (allText : string, options : DialogOptions) => {
      choice = options !== null && options.hasOwnProperty('choice') ? options.choice : null
      dialogCallback = options !== null && options.hasOwnProperty('callback') ? options.callback : null
      dialogTarget = options !== null && options.hasOwnProperty('target') ? options.target : null

      ctx.save()
      // scaling to measure text
      ctx.scale(1 / tileSize, 1 / tileSize)
      ctx.font = fontSize + 'px sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgb(28, 28, 28)'

      let splitText = allText.split('\n')
      lines.length = 0
      for (let i = 0; i < splitText.length; i++) {
        let text = splitText[i]
        let aword = wordsre.exec(text)
        let lineStart = 0
        let lineWidth = 0
        let chars = 0
        let wrapAt = (camera.width - 2) * tileSize

        // word wrap for the dialog
        while (aword !== null) {
          let [word] = aword
          let w = ctx.measureText(word).width
          if (lineWidth + w > wrapAt) {
            if (word.endsWith(' ')) {
              // if it ends in whitespace, see if it can fit at the end of current line without whitespace included
              let tw = ctx.measureText(word.trim()).width
              if (lineWidth + tw <= wrapAt) {
                chars += word.length
                lines.push(text.substring(lineStart, chars).trim())
                lineWidth = 0
                lineStart = chars
                aword = wordsre.exec(text)
                continue
              }
            }
            lines.push(text.substring(lineStart, chars).trim())
            lineStart = chars
            lineWidth = 0
          }
          chars += word.length
          lineWidth += w
          aword = wordsre.exec(text)
        }
        if (lineStart !== text.length) {
          lines.push(text.substring(lineStart, chars).trim())
        }
      }
      
      // measure widest choice
      if (choice !== null) {
        choiceWidth = 0
        for (let i = 0; i < choice.length; i++) {
          let l = ctx.measureText(choice[i]).width
          if (l > choiceWidth) {
            choiceWidth = l
          }
        }
      }
      choiceWidth += 15

      ctx.restore()
      render = dialogSetup
    }

    let paintMap = () => {
      let x1 = Math.floor(camera.x - camera.width / 2 + 0.5)
      let x2 = Math.floor(camera.x + camera.width / 2 + 0.5)
      let y1 = Math.floor(camera.y - camera.height / 2)
      let y2 = Math.floor(camera.y + camera.height / 2)
      let ox = (camera.x - (Math.floor(camera.x)))
      let px = Math.floor(ox * tileSize)
      let oy = (camera.y - Math.floor(camera.y))
      let py = Math.floor(oy * tileSize)
      ctx.translate(-x1 - ox, -y1 - oy)

      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          let i = y * area.width + x
          let img = area.bg
          if (x >= 0 && x < area.width && y >= 0 && y < area.height) {
            let cell = area.cells[i]
            if (cell.animated && cell.nextTick <= now) {
              cell.updated = true
              cell.dirty = true
            }
            if (cell.updated) {
              cell.update(now)
              cell.dirty = true
              cell.updated = false
            }
            if (!dirty && !cell.dirty) {
              continue
            }
            cell.dirty = false
            img = cell.img
          } else if (!dirty) {
            continue
          }
          let ix = 0
          let iy = 0
          let iw = tileSize
          let ih = tileSize
          let cx = x
          let cy = y
          let cw = 1
          let ch = 1
          let f = false
          if (y === y1) {
            iy = py
            ih = tileSize - py
            cy += oy
            ch = 1 - oy
          } else if (y === y2) {
            ih = py
            ch = oy
            f = true
          }
          if (x === x1) {
            ix = px
            iw = tileSize - px
            cx += ox
            cw = 1 - ox
          } else if (x === x2) {
            iw = px
            cw = ox
            f = true
          }
          ctx.drawImage(img, ix, iy, iw, ih, cx, cy, cw, ch)
        }
      }
      for (let i = 0; i < area.entities.length; i++) {
        let e = area.entities[i]
        if (e.paint) {
          for (let j = 0; j < e.sprites.length; j++) {
            e.sprites[j].animate(now)
            ctx.drawImage(e.sprites[j].image, e.x, e.y, e.w, e.h)
          }
          let x1 = Math.floor(e.x)
          let x2 = Math.ceil(e.x)
          let y1 = Math.floor(e.y)
          let y2 = Math.ceil(e.y)
          for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
              let cell = area.cellAt(x, y)
              if (cell === null) {
                continue
              }
              for (let j = 0; j < cell.olSprites.length; j++) {
                ctx.drawImage(cell.olSprites[j].image, x, y, 1, 1)
              }
            }
          }
        }
      }

      dirty = false
      ctx.translate(x1 + ox, y1 + oy)
    }

    let mapScene = () => {
      requestAnimationFrame(render)
      let fstart = performance.now()
      now = Date.now() - skip
      let ntick = (now - start) * tickRate | 0
      for (let [name, time] of held) {
        actions.push(name)
      }
      let ticked = tick < ntick
      while (tick < ntick) {
        tickNow += tickTime
        for (let i = 0; i < area.entities.length; i++) {
          area.entities[i].tick && area.entities[i].tick(tickNow)
        }
        if (tick < ntick - 1) {
          // if we're going to be running more ticks, clear special actions
          let nonSpecial = 0
          for (let i = 0; i < actions.length; i++) {
            if (actions[i].indexOf(':') !== -1) {
              nonSpecial++
            } else if (nonSpecial > 0) {
              if (actions[i].endsWith(':up')) {
                held.delete(actions[i].substring(0, actions[i].indexOf(':')))
              }
              actions[i - nonSpecial] = actions[i]
            }
          }
        }
        tick++
      }
      if (ticked) {
        actions.length = 0
      }

      for (let i = 0; i < area.entities.length; i++) {
        let e = area.entities[i]
        if (e.paint) {
          let x1 = Math.floor(e.x)
          let x2 = Math.ceil(e.x)
          let y1 = Math.floor(e.y)
          let y2 = Math.ceil(e.y)
          for (let x = x1; x <= x2; x++) {
            for (let y = y1; y <= y2; y++) {
              area.cellAt(x, y).dirty = true
            }
          }
          e.draw !== null && e.draw(now)
        }
      }
      if (camera.follow !== null) {
        if (camera.x !== camera.follow.x || camera.y !== camera.follow.y + 0.5) {
          camera.x = camera.follow.x
          camera.y = camera.follow.y + 0.5
          dirty = true
        }
      }
      paintMap()
      times[frame % times.length] = performance.now() - fstart
      // frame++ % 100 === 0 && console.log('average=%f max=%f min=%f', times.reduce(sum) / times.length, times.reduce(max), times.reduce(min))
    }
    return mapScene
  })()

  let init = () => {
    start = Date.now()
    now = start
    for (let [i, s] of sheets) {
      s.init()
    }
    updateCanvas()
    let m : { [ p : string ]: Sprite[] } = {
      a: [] as Sprite[],
      b: [  ],
      c: [ makeSprite('grass', now) ]
    }
    area = new Area([makeSprite('grass', now), makeSprite('rock', now)])
    area.width = 21 * 1
    area.height = 14 * 1
    area.cells = []
    for (let i = 0; i < area.width * area.height; i++) {
      let bg = [] as Sprite[]
      let fg = [] as Sprite[]
      let cell = new Cell(bg, fg)
      let blocking = false
      if (Math.random() < 0.4) {
        bg.push(makeSprite('blank', now))
      } else if (Math.random() < 0.1) {
        bg.push(makeSprite('rough', now))
      } else if (Math.random() < 0.1) {
        bg.push(makeSprite('smallplant', now))
      } else if (i / area.width >= 1 && Math.random() < 0.1) {
        let s = makeSprite('tallshrub_top', now)
        area.cells[i - area.width].olSprites.push(s)
        area.cells[i - area.width].bgSprites.push(s)
        bg.push(makeSprite('tallshrub_bottom', now))
        cell.passable = false
        blocking = true
      } else if (i / area.width >= 1 && Math.random() < 0.1) {
        let s = makeSprite('palm_top', now)
        area.cells[i - area.width].bgSprites.push(s)
        area.cells[i - area.width].olSprites.push(s)
        
        bg.push(makeSprite('palm_bottom', now))
        cell.passable = false
        blocking = true
      } else {
        bg.push(makeSprite('grass', now))
      }
      if (!blocking) {
        if (Math.random() < 0.08) {
          cell.entity = new CuttableTree(cell)
          cell.entity.init()
        } else if (Math.random() < 0.01) {
          bg.push(makeSprite('windmill', now))
          cell.passable = false
          cell.entity = new Billboard('This is a... windmill?')
        }
      }
      area.cells.push(cell)
    }
    area.cells.forEach(c => c.init()) // doing this here in case I clean up the test area a bit after first generation
    area.init()
    skip = 0
    tickNow = now
    requestAnimationFrame(render)
  }
  (window as any).pan = function (x : number, y : number) {
    camera.x += x
    camera.y += y
    dirty = true
    requestAnimationFrame(render)
  }
  let kz : { [ p : string ]: [number, number]; } = {
    i: [0, -0.1],
    j: [-0.1, 0],
    k: [0, 0.1],
    l: [0.1, 0]
  }
  let handlers = map<() => void>({
    'test': () => {
      let testOptions = {
        choice: ['OK', 'CANCEL'],
        callback: (i : number) => {
          switch(i) {
            case 0:
              console.log('y')
              break
            case 1:
              console.log('n')
              dialog('r u sher', testOptions)
              break
            default:
              console.log('maybe')
          }
        }
      }
      // dialog('hey yo', testOptions)
      dialog('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.', null)
    }
  })
  addEventListener('keydown', (e) => {
    if (!e.hasOwnProperty('key')) {
      e.key = String.fromCharCode(e.charCode)
    }
    let k = e.key
    if (bindings.has(k)) {
      e.preventDefault()
      let name = bindings.get(k)
      if (!held.has(name)) {
        held.set(name, now)
        actions.push(name + ':down')
      }
      if (handlers.has(name)) {
        handlers.get(name)()
      }
    }
    if (kz.hasOwnProperty(e.key)) {
      camera.x += kz[e.key][0]
      camera.y += kz[e.key][1]
      dirty = true
    }
  })
  addEventListener('keyup', (e) => {
    if (!e.hasOwnProperty('key')) {
      e.key = String.fromCharCode(e.charCode)
    }
    let k = e.key
    if (bindings.has(k)) {
      e.preventDefault()
      let name = bindings.get(k)
      if (held.has(name)) {
        held.delete(name)
      }
      actions.push(name + ':up')
    }
  })
})()