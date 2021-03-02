let e = (() => {
  'use strong'
  interface Sprite {}
  class Move {
    name = ''
    pointsBase = 0
    damageBase = 0
    manaBase = 0
  }
  class Skill {}
  let skills : Move[] = [

  ]
  class Trait {
    name = ''
    moves : Move[]
  }
  let traits : Trait[] = [
    {
      name: 'flammable',
      moves: null,
    },
    {
      name: 'kindled',
      moves: null,
    },
    {
      name: 'earthen',
      moves: null,
    },
    {
      name: 'aquatic',
      moves: null,
    }
  ]
  class Monster {
    name = ''
    portrait : Sprite = null
    portraitAway : Sprite = null
    sprite : Sprite = null
    // stats
    strBase = 0
    strGain = 0
    agiBase = 0
    agiGain = 0
    intBase = 0
    intGain = 0

    hpBase = 0
    manaBase = 0
    armorBase = 0
    magResist = 0.25
    ampBase = 1
    damageBase = 0

    speedBase = 0
    attackSpeedBase = 0
    castSpeedBase = 0
    itemSpeedBase = 0

    traits : Trait[]
  }
  class Slot {
    
  }
  class MonsterInstance extends Monster {
    moves : Move[]
    inventory : Slot[]
  }
  let monsters : Monster[] = [

  ]
  return {
    make: (name : string) => {

    }
  }
})()
namespace Monsters {
  export function get() {
    'use strong'
    return e
  }
}
