import { Link } from 'react-router-dom'

import { Footer } from '../components/layout/Footer'
import {
  ActionLink,
  FeatureItem,
  LandingScreenshot,
  MixerSection,
  SectionTitle,
} from '../components/lp/LandingPageComponents'
import { Icon } from '../components/ui/Icon'
import { featureFlags } from '../config/featureFlags'

const features = [
  {
    number: '01',
    title: '.msczをそのまま表示',
    text: 'MuseScoreファイルを読み込み、そのまま高精細な楽譜で表示します。',
    imageSrc: '/LP/App.PNG',
    imagePosition: 'center 17%',
  },
  {
    number: '02',
    title: '音符をタップして発音',
    text: '気になる音符をタップすると、その音だけをすぐに再生します。',
    imageSrc: '/LP/Select.PNG',
    imagePosition: 'center 47%',
  },
  {
    number: '03',
    title: '再生位置を自動で追従',
    text: '再生中は青い縦ラインが移動し、今どこを再生しているかが一目でわかります。',
    imageSrc: '/LP/Cursor.PNG',
    imagePosition: 'center 43%',
  },
]

const containerClass =
  'mx-auto w-[calc(100%-2rem)] max-w-295 md:w-[calc(100%-3rem)]'

export const LandingPage = () => (
  <div className="min-h-screen bg-white font-sans text-sm text-[#0c1118] md:text-base">
    <header className="flex h-13.5 items-center justify-between border-b-4 border-[#2975ff] bg-[#061b33] px-4 text-white md:h-18 md:px-[max(24px,calc((100%-1180px)/2))]">
      <Link
        className="text-[17px] font-extrabold tracking-[-0.03em] md:text-[28px]"
        to="/lp"
      >
        Refinear
      </Link>
      <nav
        className="flex items-center gap-4.5 text-[11px] font-bold md:gap-11 md:text-sm"
        aria-label="メインナビゲーション"
      >
        <a className="hidden md:block" href="#about">
          ABOUT
        </a>
        <Link to="/">アプリを開く ↗</Link>
      </nav>
    </header>

    <main>
      <section
        className={`${containerClass} grid gap-7 py-6 md:grid-cols-[0.88fr_1.12fr] md:gap-10.5 md:pt-10.5 md:pb-12`}
      >
        <div>
          <p className="mb-5 text-sm text-[#8792a1] md:mb-7">
            Refinear&nbsp; / &nbsp;about
          </p>
          <p className="text-sm font-extrabold tracking-[0.03em] text-[#1261ec]">
            MSCZ PLAYER FOR VOCAL PRACTICE
          </p>
          <h1 className="my-5 text-[29px] leading-[1.55] font-extrabold tracking-[0.02em] md:text-[clamp(32px,4vw,46px)] md:leading-normal">
            スマホで譜面を開く。
            <br />
            その音を、すぐ確かめる。
          </h1>
          <p className="leading-[1.8]">
            MuseScoreファイルをブラウザで表示・再生。
            <br />
            気になる音符はタップして、その場で音を確認できます。
          </p>
          <div className="mt-6 grid max-w-117.5 gap-4 md:mt-9">
            <ActionLink to="/">アプリを開いて試す → /</ActionLink>
            {featureFlags.demoButton && (
              <ActionLink to="/?demo=true" variant="outline">
                デモ楽譜を見る
              </ActionLink>
            )}
          </div>
          <p className="mx-1 mt-7 text-sm text-[#4c5968]">
            <span className="mr-2.5 text-[22px]" aria-hidden="true">
              ♙
            </span>
            ファイルはサーバーに送信されません
          </p>
        </div>
        <LandingScreenshot
          className="min-h-80 shadow-[0_10px_30px_#18314b18] min-[421px]:min-h-97.5 md:min-h-163.75"
          src="/LP/Home.PNG"
          alt="Refinearで楽譜を選ぶトップ画面"
          objectPosition="center top"
        />
      </section>

      <section className={`${containerClass} pb-4.5`} id="features">
        <SectionTitle>音取りに必要な操作を、譜面の上で。</SectionTitle>
        {features.map((feature) => (
          <FeatureItem key={feature.number} {...feature} />
        ))}
      </section>

      <MixerSection />

      <section
        className={`${containerClass} border-b border-[#70859c] pt-8 pb-5`}
        id="about"
      >
        <div>
          <SectionTitle>
            アプリ画面をホーム画面に追加して、すぐ練習。
          </SectionTitle>
          <p className="leading-6 text-[#374150]">
            この紹介ページではなく、先に「アプリを開く」ボタンから実際のアプリ画面を開いてください。
            <br />
            その画面をホーム画面に追加すると、次からはアイコンをタップするだけで使えます。
          </p>
          <ActionLink className="mt-1 w-fit px-5" size="compact" to="/">
            実際のアプリ画面を開く → /
          </ActionLink>
        </div>
        <ol className="mt-16 grid gap-4 text-sm md:mt-11 md:max-w-2xl md:grid-cols-2 md:text-base">
          <li className="flex items-center gap-3 rounded-lg border border-[#b7c1ce] px-4 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#0a3269] font-extrabold text-white">
              1
            </span>
            共有ボタン
            <Icon name="ios-share" size="small" />
            をタップ
          </li>
          <li className="flex items-center gap-3 rounded-lg border border-[#b7c1ce] px-4 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#0a3269] font-extrabold text-white">
              2
            </span>
            「ホーム画面に追加」を選択
          </li>
        </ol>
        <p className="mt-6.5 border-l-4 border-[#1261ec] bg-[#edf5ff] px-4 py-3.25 leading-[1.7] font-bold text-[#17365d]">
          追加するのは、この紹介ページではなく実際のアプリ画面です。追加後はホーム画面の「Refinear」から開けます。
        </p>
      </section>

      <section className="mx-auto w-full max-w-295 bg-radial from-[#12375b] to-[#061b33] px-3.5 py-6.5 text-center text-white md:w-[calc(100%-3rem)] md:p-7.5">
        <h2 className="mb-3.5 text-[23px] font-extrabold tracking-[0.08em] md:text-[34px]">
          次の音取りを、スマホから。
        </h2>
        <ActionLink
          className="mx-auto mb-2.5 max-w-120 text-xl"
          size="large"
          to="/"
          variant="light"
        >
          アプリを開く → /
        </ActionLink>
        <p className="my-1">refinear /</p>
        <small>対応形式 .mscz / インストール不要</small>
      </section>
    </main>
    <Footer />
  </div>
)
