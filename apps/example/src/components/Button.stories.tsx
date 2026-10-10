import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Save changes' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } }

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Button {...args} size="sm" />
      <Button {...args} size="md" />
      <Button {...args} size="lg" />
    </div>
  ),
}

/** Spins forever — optik freezes animations, so the screenshot is the same every time */
export const Loading: Story = {
  render: (args) => (
    <Button {...args} disabled>
      <span
        style={{
          width: 12,
          height: 12,
          border: '2px solid currentColor',
          borderRightColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      Saving…
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </Button>
  ),
}

/** Not captured: shows the time, which changes on every run */
export const WithClock: Story = {
  args: { children: new Date().toLocaleTimeString() },
  parameters: { optik: { disable: true } },
}
