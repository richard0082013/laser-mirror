export type Level = {
  id: string;
  name: string;
  grid: readonly string[];
};

export const levels: readonly Level[] = [
  {
    id: 'two-targets',
    name: '两颗水晶',
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
