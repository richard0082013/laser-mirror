export type Level = {
  id: string;
  name: string;
  grid: readonly string[];
  /** 这关最多能转几次镜子。 */
  energy: number;
};

export const levels: readonly Level[] = [
  {
    id: 'two-targets',
    name: '两颗水晶',
    energy: 5,
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
