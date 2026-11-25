import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\types.ts')
t = p.read_text(encoding='utf-8')
old = """  Skill?: string;
  WiseSkill?: string;
  POS?: string;
  CITY?: string;"""
new = """  /** 多值字段一律数组：1 条也是数组（见 project/08 §9.5） */
  SKILL?: Array<[number, number]>;
  WISESKILL?: Array<[number, number]>;
  Skill?: Array<[number, number]>;
  POS?: string[];
  BattleArray?: string[];
  Force?: string[];
  UseForce?: string[];
  CITY?: string;"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('types updated')
