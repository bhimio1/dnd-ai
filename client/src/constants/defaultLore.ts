export const DEFAULT_LORE_MARKDOWN = `# Welcome to LoreWeaver

This is your campaign overview. Use this space to document the world, or select a document from the left to begin editing.

## Custom Parsing Examples

LoreWeaver supports D&D 5e style formatting blocks. Here are some examples:

### Monster Stat Block
{{monster,frame
## Goblin
*Small humanoid (goblinoid), neutral evil*
___
**Armor Class** :: 15 (leather armor, shield)
**Hit Points** :: 7 (2d6)
**Speed** :: 30 ft.
___
|STR|DEX|CON|INT|WIS|CHA|
|:---:|:---:|:---:|:---:|:---:|:---:|
|8 (-1)|14 (+2)|10 (+0)|10 (+0)|8 (-1)|8 (-1)|
___
**Skills** :: Stealth +6
**Senses** :: darkvision 60 ft., passive Perception 9
**Languages** :: Common, Goblin
**Challenge** :: 1/4 (50 XP)
___
***Nimble Escape.*** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.

### Actions
***Scimitar.*** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.
}}

### Class Table
{{class,frame,wide
## The Fighter
| Level | Proficiency Bonus | Features |
|:---:|:---:|:---|
| 1st | +2 | Fighting Style, Second Wind |
| 2nd | +2 | Action Surge (one use) |
| 3rd | +2 | Martial Archetype |
}}

### Note Block
{{note
**Note:** This is a note block. Use it for sidebars or special rules.
}}

### Descriptive Text
{{descriptive
This is a descriptive text block. It's great for read-aloud text or scene setting.
}}
`;
