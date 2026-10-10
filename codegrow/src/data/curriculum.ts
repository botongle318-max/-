export interface Lesson {
  id: string
  title: string
  module: string
  description: string
  concept: string
  objectives: string[]
  explanation: string
  example: string
  starterCode: string
  expectedOutput: string
  stdin: string
  hints: string[]
  difficulty: number
  duration: number
}

export interface CourseModule {
  id: string
  title: string
  description: string
  level: '基础' | '进阶'
}

export const modules: CourseModule[] = [
  { id: 'basics', title: '基础语法', description: '写下你的第一行 C 代码', level: '基础' },
  { id: 'variables', title: '变量', description: '给程序一份可以变化的记忆', level: '基础' },
  { id: 'data-types', title: '数据类型', description: '理解整数、小数和字符', level: '基础' },
  { id: 'input-output', title: '输入与输出', description: '让程序与使用者对话', level: '基础' },
  { id: 'conditions', title: '条件判断', description: '根据条件选择不同的路', level: '基础' },
  { id: 'loops', title: '循环', description: '把重复工作交给程序', level: '基础' },
  { id: 'arrays', title: '数组', description: '有条理地处理一组数据', level: '基础' },
  { id: 'functions', title: '函数', description: '把大问题拆成小步骤', level: '基础' },
  { id: 'pointers', title: '指针', description: '探索地址与内存', level: '进阶' },
  { id: 'structs', title: '结构体', description: '组合数据，描述真实事物', level: '进阶' },
  { id: 'files', title: '文件操作', description: '保存与读取程序数据', level: '进阶' },
]

export const lessons: Lesson[] = [
  {
    id: 'hello-world', title: '你好，CodeGrow！', module: 'basics',
    description: '从一条输出语句开始，认识 C 程序的基本结构。', concept: '程序结构 · printf',
    objectives: ['找到程序的入口 main', '使用 printf 输出文字', '理解分号与换行符的作用'],
    explanation: '每个 C 程序从 main 函数开始执行。花括号里的语句按顺序运行，每条语句通常以分号结尾。stdio.h 提供 printf 等输入输出函数；字符串要放在双引号里，\\n 表示换行。\n\n练习：让程序输出 Hello, CodeGrow!，并在末尾换行。先自己试一试，再按需要请求提示。',
    example: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    // 在这里输出 Hello, CodeGrow!\n\n    return 0;\n}\n',
    expectedOutput: 'Hello, CodeGrow!\n', stdin: '', duration: 8, difficulty: 1,
    hints: ['想一想：哪个函数可以把一段文字显示在屏幕上？', '把输出语句写在 main 的花括号内、return 0 之前。', 'printf 的括号里放双引号包围的文字；\\n 表示换行，语句结尾需要分号。', 'printf("Hello, CodeGrow!\\n");'],
  },
  {
    id: 'variables', title: '变量：程序的记忆', module: 'variables',
    description: '用变量保存两次练习的得分，计算总分。', concept: 'int · 赋值 · 加法',
    objectives: ['声明并初始化整数变量', '用表达式计算结果', '用 %d 输出整数'],
    explanation: '变量像贴着名字的盒子。int first = 8; 创建一个名叫 first 的整数盒子，里面放着 8。等号表示把右边的结果放进左边的变量。printf 中的 %d 是整数的占位符。\n\n练习：first 为 8，second 为 5。计算两个变量的和，输出 13 并换行。请用变量计算，不要直接输出答案。',
    example: 'int apples = 3;\nint oranges = 4;\nint fruit = apples + oranges;\nprintf("%d\\n", fruit);',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int first = 8;\n    int second = 5;\n    int total = 0; // 用表达式计算总分\n\n    printf("%d\\n", total);\n    return 0;\n}\n',
    expectedOutput: '13\n', stdin: '', duration: 10, difficulty: 1,
    hints: ['你需要把两个盒子里的数字相加，而不是把答案写死。', '观察 total 的初始化语句，目前它被设为了 0。', '加法表达式 first + second 的值可以直接赋给 total。', 'int total = first + second;'],
  },
  {
    id: 'data-types', title: '保留小数的计算', module: 'data-types',
    description: '计算半径为 2 的圆的面积，输出两位小数。', concept: 'double · 格式化输出',
    objectives: ['区分 int 与 double', '用小数变量参与计算', '用 %.2f 控制小数位数'],
    explanation: 'int 保存整数；double 用来保存小数。把小数结果存进 int 会丢掉小数部分。输出 double 时，可以使用 %f；%.2f 让结果保留两位小数。\n\n练习：圆的面积 = π × 半径 × 半径。使用 pi = 3.14 和 radius = 2.0 计算面积，输出 12.56。',
    example: 'double price = 6.5;\ndouble quantity = 2.0;\nprintf("%.2f\\n", price * quantity);',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    double pi = 3.14;\n    double radius = 2.0;\n    double area = 0.0; // 计算圆的面积\n\n    printf("%.2f\\n", area);\n    return 0;\n}\n',
    expectedOutput: '12.56\n', stdin: '', duration: 10, difficulty: 1,
    hints: ['回忆面积公式：半径需要参与几次乘法？', '检查 area 的赋值，而不是改动 printf。', 'C 的乘法符号是 *。连乘可以写成 a * b * b。', 'double area = pi * radius * radius;'],
  },
  {
    id: 'input-output', title: '让程序读懂输入', module: 'input-output',
    description: '读取两个整数，输出它们的和。', concept: 'scanf · 标准输入',
    objectives: ['从标准输入读取整数', '理解 scanf 中的 &', '将输入与计算连接起来'],
    explanation: 'scanf 从标准输入读取数据。scanf("%d", &number) 告诉它读取整数，并把结果放进 number 的地址。读取两个整数可以使用 "%d %d" 和两个变量地址。\n\n练习：测试输入是 7 5。读取这两个整数并输出它们的和。运行区的输入框可以修改输入，观察程序是否仍然正确。',
    example: 'int age;\nif (scanf("%d", &age) == 1) {\n    printf("%d\\n", age);\n}',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int a = 0;\n    int b = 0;\n    // 从标准输入读取两个整数\n\n    printf("%d\\n", a + b);\n    return 0;\n}\n',
    expectedOutput: '12\n', stdin: '7 5\n', duration: 12, difficulty: 2,
    hints: ['程序现在输出 0，因为两个变量还没有收到输入。', '在变量声明之后、printf 之前加入读取语句。', 'scanf 需要格式字符串和变量地址。%d 对应 int，&a 表示 a 的地址；检查返回值能确认成功读取的项数。', 'if (scanf("%d %d", &a, &b) != 2) {\n    return 1;\n}'],
  },
  {
    id: 'conditions', title: '为程序做一次选择', module: 'conditions',
    description: '判断成绩是否达到 60 分，输出及格结果。', concept: 'if / else · 比较运算',
    objectives: ['用条件表达式判断大小', '使用 if 与 else 分支', '考虑边界值 60'],
    explanation: 'if 后面的括号里放条件。条件成立时运行第一个花括号里的语句，否则执行 else 分支。>= 表示“大于或等于”；不要把用于赋值的 = 与用于判断相等的 == 混淆。\n\n练习：score 为 76。成绩大于或等于 60 时输出 Pass，否则输出 Retry。写完后，可以把成绩改成 60 和 59，自己检查边界。',
    example: 'int temperature = 31;\nif (temperature > 30) {\n    printf("Hot\\n");\n} else {\n    printf("Cool\\n");\n}',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int score = 76;\n    // 根据 score 输出 Pass 或 Retry\n\n    return 0;\n}\n',
    expectedOutput: 'Pass\n', stdin: '', duration: 12, difficulty: 2,
    hints: ['及格线本身也算及格，这会影响你选择哪个比较符号。', '判断条件应该使用 score 和 60。输出分成两个分支。', 'score >= 60 包含 60 分。if 和 else 的花括号里分别放对应的 printf。', 'if (score >= 60) {\n    printf("Pass\\n");\n} else {\n    printf("Retry\\n");\n}'],
  },
  {
    id: 'for-loop', title: '用循环解决重复问题', module: 'loops',
    description: '计算 1 到 10 的总和，练习控制循环边界。', concept: 'for 循环 · 累加器',
    objectives: ['读懂 for 的三个部分', '用累加器保存结果', '发现循环边界的偏一错误'],
    explanation: 'for (初始化; 条件; 更新) 描述一段重复执行的工作。初始化只执行一次；每轮执行前检查条件；每轮结束后更新变量。累加器通常从 0 开始，每轮把当前数字加进去。\n\n练习：下方程序想计算 1 到 10 的总和，却漏掉了一个数字。先预测它会输出什么，再运行验证。修改循环，让结果等于 55。',
    example: 'int sum = 0;\nfor (int i = 1; i <= 3; i++) {\n    sum += i;\n}\nprintf("%d\\n", sum); // 1 + 2 + 3',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int sum = 0;\n\n    for (int i = 1; i < 10; i++) {\n        sum += i;\n    }\n\n    printf("%d\\n", sum);\n    return 0;\n}\n',
    expectedOutput: '55\n', stdin: '', duration: 15, difficulty: 2,
    hints: ['列出循环中 i 实际经历的数值。最后一个数字被算进去了吗？', '检查 for 括号里的判断条件，尤其是 10 是否包含在范围内。', 'i < 10 在 i 等于 10 时为假，循环不会执行这一轮。需要包含上界时，可以使用 <=。', 'for (int i = 1; i <= 10; i++) {\n    sum += i;\n}'],
  },
  {
    id: 'while-loop', title: '什么时候停止重复？', module: 'loops',
    description: '用 while 统计正整数 2026 有多少位。', concept: 'while · 整数除法',
    objectives: ['理解 while 的退出条件', '在循环里更新状态', '用整数除法逐位处理数字'],
    explanation: 'while (条件) 在条件为真时反复执行。循环内部必须有机会让条件变为假，否则就会无限运行。整数除以 10 会丢掉末尾一位，例如 123 / 10 等于 12。\n\n练习：反复把 number 除以 10，直到它等于 0。每处理一位，增加 count。输出 2026 的位数。本练习只考虑正整数。',
    example: 'int remaining = 3;\nwhile (remaining > 0) {\n    printf("%d\\n", remaining);\n    remaining--;\n}',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int number = 2026;\n    int count = 0;\n\n    // 使用 while 逐位处理 number\n\n    printf("%d\\n", count);\n    return 0;\n}\n',
    expectedOutput: '4\n', stdin: '', duration: 15, difficulty: 2,
    hints: ['2026 → 202 → 20 → 2 → 0。每一步可以统计一位。', '循环条件检查 number 是否大于 0。循环里要同时更新 number 和 count。', 'number /= 10 等价于 number = number / 10；count++ 为计数器加一。', 'while (number > 0) {\n    number /= 10;\n    count++;\n}'],
  },
  {
    id: 'arrays', title: '让一组数字排好队', module: 'arrays',
    description: '遍历数组，计算四个数字的总和。', concept: '数组 · 索引 · 遍历',
    objectives: ['声明一个整数数组', '使用从 0 开始的索引', '用循环遍历数组而不越界'],
    explanation: '数组把同一类型的一组数据放在一起。int values[4] = {2, 4, 6, 8}; 定义了四个整数。索引从 0 开始，因此最后一个元素是 values[3]，不是 values[4]。\n\n练习：用循环累加 values 中的全部元素，输出 20。请不要直接把四个数字相加，让循环替你处理每个元素。',
    example: 'int scores[3] = {80, 90, 85};\nfor (int i = 0; i < 3; i++) {\n    printf("%d\\n", scores[i]);\n}',
    starterCode: '#include <stdio.h>\n\nint main(void) {\n    int values[4] = {2, 4, 6, 8};\n    int sum = 0;\n\n    // 遍历 values 并计算总和\n\n    printf("%d\\n", sum);\n    return 0;\n}\n',
    expectedOutput: '20\n', stdin: '', duration: 15, difficulty: 3,
    hints: ['数组有 4 个元素，但第一个元素的索引是 0。', '循环索引应该依次是 0、1、2、3，使用 values[i] 访问元素。', '条件 i < 4 能防止访问不存在的 values[4]。每轮把 values[i] 加进 sum。', 'for (int i = 0; i < 4; i++) {\n    sum += values[i];\n}'],
  },
  {
    id: 'functions', title: '把计算装进函数', module: 'functions',
    description: '实现一个计算平方的函数，再在 main 中调用它。', concept: '参数 · 返回值 · 函数调用',
    objectives: ['定义带参数的函数', '使用 return 返回计算结果', '把独立计算逻辑从 main 中拆出'],
    explanation: '函数让一段有名字的工作可以反复使用。参数是输入，return 后面的值是输出。int square(int number) 表示这个函数接收一个整数，也返回一个整数。\n\n练习：补全 square 函数，让 square(6) 的结果为 36。main 已经写好调用，你只需要完成函数内部的计算。',
    example: 'int add(int a, int b) {\n    return a + b;\n}\n\nint result = add(3, 4);',
    starterCode: '#include <stdio.h>\n\nint square(int number) {\n    // 返回 number 的平方\n    return 0;\n}\n\nint main(void) {\n    printf("%d\\n", square(6));\n    return 0;\n}\n',
    expectedOutput: '36\n', stdin: '', duration: 15, difficulty: 3,
    hints: ['平方的含义是一个数与它自己相乘。', '需要修改 square 内部的 return，main 中的调用可以保持原样。', '参数 number 会在调用时得到 6。return 可以直接返回一个表达式的值。', 'int square(int number) {\n    return number * number;\n}'],
  },
]
