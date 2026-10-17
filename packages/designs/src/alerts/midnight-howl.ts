// Midnight howl: a crooked tombstone card that drops in and wobbles, dripping horror
// letters, a pale moon behind the art and bats scattering off once. The Spark sits on the
// card's edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'midnight-howl',
    name: 'Midnight howl',
    description:
      'A crooked tombstone that drops in, dripping letters and bats scattering off the moon.',
    style: 'playful',
    motion: 'bouncy',
  },
  {
    frame: 'plate',
    layout: 'right',
    media_size: 150,
    font: font('Creepster', 54, 400, { letter_spacing: 0.03 }),
    colors: colors('#efe6d8', '#8cff4a', '#231433', '#ff7a1a', '#0d0716'),
    shadow: 'hard',
    anim: motion('drop', 'sink', 'wiggle', 700, 500, 300),
    sound: { ref: null, builtin: 'bass', volume: 65 },
    duration_ms: 7000,
    brand: 'edge',
    css: css(
      '.f-plate .fa-text{background:linear-gradient(180deg,#3a2550,#1c1029);border:3px solid #5b2a86;border-radius:120px 120px 10px 10px;padding:40px 44px 26px;rotate:-2deg;box-shadow:8px 10px 0 #0d0716,inset 0 -10px 0 #140b20}',
      '.fa-title .hl{text-shadow:0 0 16px #8cff4a88}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;color:#d8c9ea}',
      '.f-plate .fa-media{border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff8e6,#f0dfb4 60%,#c9b27a);box-shadow:0 0 50px #f0dfb488;overflow:visible}',
      '.fa-emblem{background:none;color:#231433}',
      '.fa-emblem svg{filter:none}',
      '.fa-media::before,.fa-media::after{content:"";position:absolute;width:46px;height:22px;background:#0d0716;clip-path:polygon(50% 30%,56% 18%,60% 34%,72% 22%,100% 30%,88% 44%,84% 66%,72% 56%,62% 70%,50% 92%,38% 70%,28% 56%,16% 66%,12% 44%,0 30%,28% 22%,40% 34%,44% 18%);animation:fc-bat 1.6s ease-out .4s both}',
      '.fa-media::before{left:10%;top:12%}',
      '.fa-media::after{right:4%;top:40%;scale:.7;animation-delay:.6s}',
      '@keyframes fc-bat{from{transform:translate(30px,40px) scale(.4);opacity:0}}',
    ),
  },
)
