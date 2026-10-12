describe('home page', () => {
  beforeEach(() => cy.visit('/'))

  it('looks as approved', () => {
    cy.title().should('match', /Optik Example/)
    cy.optikSnapshot('home/full-page')
  })

  it('buttons section', () => {
    cy.get('section').first().optikSnapshot('home/buttons')
  })

  it('cards section', () => {
    cy.get('section').last().optikSnapshot('home/cards')
  })
})
