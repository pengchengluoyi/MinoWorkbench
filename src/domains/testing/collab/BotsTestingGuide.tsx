import { Fold } from '@/ui'
import './BotsTestingGuide.css'

export function BotsTestingGuide() {
  return (
    <Fold title="软件测试 Bots 怎么用（4 步）" storageKey="mino-bots-guide-open" defaultOpen={true}>
      <ol className="bots-testing-guide">
        <li>
          <strong>创建议题</strong>：左侧填标题和测试目标（例如「XX 版本登录与下单回归」）。从用例页点「讨论此用例」会自动建议题。
        </li>
        <li>
          <strong>在讨论区说话</strong>：测试 Bot 会回复，并按你的话自动推进（例如「直接执行用例」「继续推进」）。不必只点按钮。
        </li>
        <li>
          <strong>点「运行测试分析」</strong>：Nexus 自动做需求分析 → 评审 → 脑图 → 用例候选，并在右侧生成<strong>工作项</strong>（不会自动改正式用例）。
        </li>
        <li>
          <strong>在工作项里确认</strong>：典型顺序是「确认写入用例草稿」→「推进 QA」→「触发用例执行」。需先在设置里配置好模型与执行账号。
        </li>
      </ol>
      <p className="bots-testing-guide-note">
        这是<strong>测试交付</strong>能力，不是代码开发代理。编排详情在下方「查看编排过程」中展开。
      </p>
    </Fold>
  )
}
