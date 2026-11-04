export type Level = {
  id: string;
  name: string;
  grid: readonly string[];
  /** 过关最少要转几次镜子，测试会核对。 */
  par: number;
};

export const levels: readonly Level[] = [
  {
    id: 'two-targets',
    name: '两颗水晶',
    par: 3,
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
