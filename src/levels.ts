export type Level = {
  id: string;
  name: string;
  grid: readonly string[];
};

export const levels: readonly Level[] = [
  {
    id: 'two-targets',
    name: '两个目标',
    grid: [
      '########',
      '#>../.T#',
      '#...T..#',
      '#.../.\\#',
      '#.#....#',
      '#......#',
      '########',
    ],
  },
];
