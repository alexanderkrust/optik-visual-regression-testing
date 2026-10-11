import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { Card } from './Card'

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { title: 'Visual review', description: 'Three snapshots changed in this run.' },
  // Cards also appear on tablets: capture them in a third viewport
  parameters: { optik: { viewports: ['375x667', '768x1024', '1280x720'] } },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithAction: Story = {
  args: { children: <Button size="sm">Review changes</Button> },
}
