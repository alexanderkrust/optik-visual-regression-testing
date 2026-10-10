import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'
import { Card } from './Card'

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { title: 'Visual review', description: 'Three snapshots changed in this run.' },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithAction: Story = {
  args: { children: <Button size="sm">Review changes</Button> },
}
