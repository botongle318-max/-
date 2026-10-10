export type TutorMode = 'guide' | 'practice' | 'challenge' | 'debug'

export interface TutorRequest {
  message: string
  code: string
  lessonTitle: string
  hintLevel: number
  mode: TutorMode
  lastError?: string
  hints?: string[]
  permitReference?: boolean
}

export interface TutorReply {
  content: string
  source: 'local' | 'ai'
}

const referenceRequest = /(?:参考|示例|完整|正确)\s*(?:代码|答案)|(?:给|看|提供|展示).{0,8}(?:代码|答案)|(?:reference|sample)\s+code/i
const declinedReference = /(?:不要|别|不想|不需要|不要直接|do not|don't).{0,80}(?:代码|答案|code|answer)/i

export function wantsReference(message: string): boolean {
  return referenceRequest.test(message) && !declinedReference.test(message)
}

function effectiveHintLevel(request: TutorRequest): number {
  const level = Math.min(4, Math.max(1, Math.trunc(request.hintLevel) || 1))
  return level === 4 && !(request.permitReference || wantsReference(request.message)) ? 3 : level
}

function explainConcept(message: string, lesson: string): { explanation: string; question: string } {
  const context = `${message} ${lesson}`
  if (/指针|pointer/i.test(context)) {
    return { explanation: '指针保存的是一个对象在内存里的地址。可以把变量想成一个房间，把指针想成写着房间地址的纸条；取地址和访问房间里的内容是两件事。', question: '如果 p 保存变量 a 的地址，你觉得 p 和 *p 分别代表什么？' }
  }
  if (/数组|array/i.test(context)) {
    return { explanation: '数组把同类型的数据按顺序放在一起。C 语言数组的第一个位置是 0，所以长度为 n 的数组最后一个有效下标是 n - 1。', question: '一个长度为 5 的数组，可以使用的下标分别是什么？' }
  }
  if (/函数|function/i.test(context)) {
    return { explanation: '函数把一项明确的工作封装起来：参数是输入，函数体处理输入，返回值是结果。先说清楚输入和输出，通常就能更容易地设计函数。', question: '如果要写一个求两个数中较大值的函数，它需要什么输入，应该返回什么？' }
  }
  if (/循环|for|while/i.test(context)) {
    return { explanation: '循环让一段代码重复执行。写循环前先确定三件事：从哪里开始、什么时候继续、每次如何向结束条件靠近。', question: '要输出 1 到 10，你会怎样设置起点、继续条件和每次的变化？' }
  }
  if (/条件|判断|\bif\b|\belse\b/i.test(context)) {
    return { explanation: '条件判断根据条件是否成立选择不同的执行路径。先把自然语言里的条件写清楚，再把它翻译成比较表达式。', question: '如果分数恰好等于 60，它应该进入哪条分支？你的条件覆盖了这个边界吗？' }
  }
  if (/输入|输出|scanf|printf/i.test(context)) {
    return { explanation: 'printf 把数据显示出来，scanf 把输入写入变量。格式符要与数据类型匹配；读取普通变量时，scanf 还需要知道它的地址。', question: '为什么输出整数时通常直接写变量，而读取整数时通常需要在变量前加 &？' }
  }
  if (/变量|类型|int|float|double/i.test(context)) {
    return { explanation: '变量是有名字、有类型的存储位置。类型决定能保存什么数据，也决定某些运算的行为，例如两个整数相除时小数部分会被舍去。', question: '你希望保存的数据是整数还是小数？这个选择会怎样影响你的计算结果？' }
  }
  return { explanation: `我们可以把“${lesson || '这道练习'}”拆成输入、处理和输出三部分。先用自己的话描述目标，再把步骤逐个翻译成代码。`, question: '先不写代码，你能用三句话说明输入是什么、要做什么处理、输出是什么吗？' }
}

function diagnose(request: TutorRequest): { range: string; reason: string; question: string } {
  const error = request.lastError ?? ''
  const code = request.code
  if (/expected.*(?:;|semicolon)|缺少.*分号/i.test(error)) {
    return { range: '编译器标记行以及它的上一行', reason: 'C 语言用分号结束语句。缺失分号时，编译器可能到下一行才发现语法不能继续，所以标记位置不一定是根因。', question: '从标记行向上检查：上一条声明或表达式是否完整结束了？' }
  }
  if (/undeclared|未声明/i.test(error)) {
    return { range: '出错变量的声明、拼写和作用域', reason: '变量需要先声明再使用，且只能在它所属的作用域内访问。C 语言还会区分大小写。', question: '变量第一次出现在哪里？它的声明是否在当前花括号范围内，并且拼写完全一致？' }
  }
  if (/scanf\s*\(\s*"[^"\n]*%[df]"\s*,\s*[a-zA-Z_]\w*\s*\)/.test(code)) {
    return { range: 'scanf 的第二个参数', reason: 'scanf 要把输入写入某个内存位置，因此通常接收变量的地址，而不是变量当前保存的数值。', question: '哪个运算符可以取得一个普通变量的地址？注意字符数组的处理方式有所不同。' }
  }
  if (/for\s*\([^)]*;\s*[^;]*<=\s*\w+\s*;/.test(code)) {
    return { range: '循环的继续条件与最后一次迭代', reason: '边界条件决定最后一次是否还会执行。使用 <= 时会包含右侧边界；数组的有效下标不包含数组长度本身。', question: '把第一次和最后一次的变量值写在纸上，它们都在题目允许的范围内吗？' }
  }
  if (/timeout|超时|无限循环/i.test(error)) {
    return { range: '循环条件与控制变量更新', reason: '循环必须有机会让继续条件变为假。控制变量不更新、方向写反，或者循环体中重置变量，都可能让程序一直运行。', question: '每执行一轮，哪一个值会发生变化？它是否真的在靠近结束条件？' }
  }
  return { range: '最先出现的错误、相关表达式和边界输入', reason: error ? '后面的错误有时只是第一个错误引发的连锁反应。先对照错误位置检查，再用一个最小输入手动追踪变量的变化。' : '程序能编译只说明语法通过。是否正确还需要检查实际输出、题目要求和边界输入。', question: '请给我一个具体输入、你预期的输出，以及程序实际的输出。它们第一次产生差异的步骤在哪里？' }
}

function localReply(request: TutorRequest): TutorReply {
  const level = effectiveHintLevel(request)
  const concept = explainConcept(request.message, request.lessonTitle)
  const diagnosis = diagnose(request)
  const suppliedHint = request.hints?.[level - 1]?.trim()
  const levelNames = ['思路提示', '错误定位', '知识解释', '参考片段']
  const heading = `本地练习导师 · L${level} ${levelNames[level - 1]}`
  let body: string

  if (level === 4) {
    body = suppliedHint
      ? `以下是你主动请求的参考片段。先解释每一行为什么这样写，再离开提示独立完成一次：\n\n${suppliedHint.includes('```') ? suppliedHint : `\`\`\`c\n${suppliedHint}\n\`\`\``}\n\n接下来，请改变一个输入或边界条件，预测结果并验证。`
      : '下面是一个循环结构的参考片段，先解释每个部分的作用，再自行迁移到当前题目：\n\n```c\nfor (int i = 0; i < count; i++) {\n    /* 在这里完成一轮处理 */\n}\n```\n\n它不是当前任务的完整答案。请先预测 count 为 0、1、3 时分别执行多少次。'
  } else if (request.mode === 'debug') {
    body = level === 1
      ? `先处理第一个错误，并用最小输入验证你的判断。${suppliedHint ? `\n\n课程思路：${suppliedHint}` : ''}\n\n${diagnosis.question}`
      : level === 2
        ? `建议检查：${diagnosis.range}。${suppliedHint ? `\n\n课程定位：${suppliedHint}` : ''}\n\n${diagnosis.question}`
        : `${diagnosis.reason}\n\n检查范围：${diagnosis.range}。${suppliedHint ? `\n\n相关知识：${suppliedHint}` : ''}\n\n${diagnosis.question}\n\n补救练习：只保留与问题有关的几行，手动追踪一次，再运行验证。`
  } else if (request.mode === 'challenge') {
    body = `${suppliedHint ? `当前线索：${suppliedHint}\n\n` : level >= 3 ? `${concept.explanation}\n\n` : ''}试着为当前实现设计三个测试：普通输入、边界输入和容易遗漏的输入。\n\n如果数据量扩大 100 倍，你的实现会受到什么影响？先说明理由，再尝试优化。`
  } else if (request.mode === 'practice') {
    body = `把当前练习分成一个最小可验证步骤，完成后运行一次。\n\n${suppliedHint || (level >= 3 ? concept.explanation : concept.question)}\n\n先写出你的预测，再查看程序输出。完成后告诉我哪一步与你的预测不同。`
  } else {
    body = `${level >= 3 || !suppliedHint ? `${concept.explanation}\n\n` : ''}${suppliedHint ? `${suppliedHint}\n\n` : ''}${concept.question}`
  }

  if (request.hintLevel >= 4 && level < 4) {
    body += '\n\n参考片段需要你主动请求。你可以先尝试回答上面的问题，或明确发送“我想看参考代码”。'
  }

  return { content: `${heading}\n\n${body}`, source: 'local' }
}

function getEndpoint(): string | null {
  const saved = localStorage.getItem('codegrow-ai-endpoint')?.trim()
  if (!saved) return null
  const url = new URL(saved)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error('导师服务地址必须为 HTTPS，或本机 localhost HTTP 地址。')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/v1/tutor') ? path : `${path}/v1/tutor`
  return url.toString()
}

/** Uses the optional trusted proxy. The default is a deterministic, offline teaching helper. */
export async function getTutorReply(request: TutorRequest, signal?: AbortSignal): Promise<TutorReply> {
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
  const payload = { ...request, hintLevel: effectiveHintLevel(request) }
  let endpoint: string | null
  try {
    endpoint = getEndpoint()
  } catch {
    const fallback = localReply(request)
    return { ...fallback, content: `导师服务地址配置无效，已使用本地引导。\n\n${fallback.content}` }
  }
  if (!endpoint) return localReply(request)

  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timeout = setTimeout(() => controller.abort(), 35_000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`导师服务暂不可用 (${response.status})`)
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('content' in result) || typeof result.content !== 'string' || !result.content.trim() || result.content.length > 12_000 || !('source' in result) || result.source !== 'ai') {
      throw new Error('导师服务返回了无效结果')
    }
    return { content: result.content, source: 'ai' }
  } catch {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    const fallback = localReply(request)
    return { ...fallback, content: `云端导师暂时无法连接，以下为本地引导。\n\n${fallback.content}` }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
