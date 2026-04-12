import { PrismaClient, SectionType, TestStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@toeic.local' },
    update: {},
    create: {
      email: 'demo@toeic.local',
      fullName: 'Demo User',
    },
  });

  const mockTest = await prisma.mockTest.create({
    data: {
      slug: `toeic-set-${Date.now()}`,
      title: 'TOEIC Mock Test 01',
      description: 'Demo mock test for Express scaffold',
      status: TestStatus.PUBLISHED,
      durationSec: 7200,
      totalQuestions: 4,
      sections: {
        create: [
          {
            type: SectionType.LISTENING,
            title: 'Listening',
            orderNo: 1,
            parts: {
              create: {
                title: 'Part 1',
                orderNo: 1,
                questions: {
                  create: [
                    {
                      orderNo: 1,
                      questionNumber: 1,
                      stem: 'What is happening in the picture?',
                      choices: {
                        create: [
                          { label: 'A', content: 'A man is opening a box.', isCorrect: true },
                          { label: 'B', content: 'A man is closing a gate.' },
                          { label: 'C', content: 'A woman is driving a car.' },
                          { label: 'D', content: 'People are eating lunch.' },
                        ],
                      },
                    },
                    {
                      orderNo: 2,
                      questionNumber: 2,
                      stem: 'Where most likely are the speakers?',
                      choices: {
                        create: [
                          { label: 'A', content: 'At a library' },
                          { label: 'B', content: 'At a train station', isCorrect: true },
                          { label: 'C', content: 'At a pharmacy' },
                          { label: 'D', content: 'At a hotel' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
          {
            type: SectionType.READING,
            title: 'Reading',
            orderNo: 2,
            parts: {
              create: {
                title: 'Part 5',
                orderNo: 1,
                questions: {
                  create: [
                    {
                      orderNo: 1,
                      questionNumber: 101,
                      stem: 'Please submit the report ____ Friday.',
                      choices: {
                        create: [
                          { label: 'A', content: 'in' },
                          { label: 'B', content: 'at' },
                          { label: 'C', content: 'by', isCorrect: true },
                          { label: 'D', content: 'from' },
                        ],
                      },
                    },
                    {
                      orderNo: 2,
                      questionNumber: 102,
                      stem: 'The manager asked the team to work more ____.',
                      choices: {
                        create: [
                          { label: 'A', content: 'efficiently', isCorrect: true },
                          { label: 'B', content: 'efficient' },
                          { label: 'C', content: 'efficiency' },
                          { label: 'D', content: 'efficientness' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    },
    include: { sections: true },
  });

  console.log({ userId: user.id, mockTestId: mockTest.id });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
