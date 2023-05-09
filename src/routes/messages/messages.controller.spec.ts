import { faker } from '@faker-js/faker';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { random, range } from 'lodash';
import * as request from 'supertest';
import { TestAppProvider } from '../../app.provider';
import {
  fakeConfigurationService,
  TestConfigurationModule,
} from '../../config/__tests__/test.configuration.module';
import {
  fakeCacheService,
  TestCacheModule,
} from '../../datasources/cache/__tests__/test.cache.module';
import {
  mockNetworkService,
  TestNetworkModule,
} from '../../datasources/network/__tests__/test.network.module';
import { DomainModule } from '../../domain.module';
import { chainBuilder } from '../../domain/chains/entities/__tests__/chain.builder';
import { pageBuilder } from '../../domain/entities/__tests__/page.builder';
import { messageConfirmationBuilder } from '../../domain/messages/entities/__tests__/message-confirmation.builder';
import {
  messageBuilder,
  toJson as messageToJson,
} from '../../domain/messages/entities/__tests__/message.builder';
import { safeAppBuilder } from '../../domain/safe-apps/entities/__tests__/safe-app.builder';
import { safeBuilder } from '../../domain/safe/entities/__tests__/safe.builder';
import { ValidationModule } from '../../validation/validation.module';
import { TestLoggingModule } from '../../logging/__tests__/test.logging.module';
import { MessageStatus } from './entities/message.entity';
import { createMessageDtoBuilder } from './entities/__tests__/create-message.dto.builder';
import { updateMessageSignatureDtoBuilder } from './entities/__tests__/update-message-signature.dto.builder';
import { MessagesModule } from './messages.module';

describe('Messages controller', () => {
  let app: INestApplication;

  const safeConfigUrl = faker.internet.url();

  beforeAll(async () => {
    fakeConfigurationService.set('safeConfig.baseUri', safeConfigUrl);
    fakeConfigurationService.set('exchange.baseUri', faker.internet.url());
    fakeConfigurationService.set(
      'exchange.apiKey',
      faker.random.alphaNumeric(),
    );
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    fakeCacheService.clear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // feature
        MessagesModule,
        // common
        DomainModule,
        TestCacheModule,
        TestConfigurationModule,
        TestLoggingModule,
        TestNetworkModule,
        ValidationModule,
      ],
    }).compile();

    app = await new TestAppProvider().provide(moduleFixture);
    await app.init();
  });

  describe('GET messages by hash', () => {
    it('Get a confirmed message with no safe app associated', async () => {
      const chain = chainBuilder().build();
      const safeApps = [];
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ max: messageConfirmations.length }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          case `${safeConfigUrl}/api/v1/safe-apps/`:
            return Promise.resolve({ data: safeApps });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.Confirmed,
          logoUri: null,
          name: null,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: message.preparedSignature,
        });
    });

    it('Get a confirmed message with a safe app associated', async () => {
      const chain = chainBuilder().build();
      const safeApps = range(random(2, 5)).map(() => safeAppBuilder().build());
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('safeAppId', safeApps[1].id)
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ max: messageConfirmations.length }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          case `${safeConfigUrl}/api/v1/safe-apps/`:
            return Promise.resolve({ data: safeApps });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.Confirmed,
          logoUri: safeApps[1].iconUrl,
          name: safeApps[1].name,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: message.preparedSignature,
        });
    });

    it('Get an unconfirmed message with no safe app associated', async () => {
      const chain = chainBuilder().build();
      const safeApps = [];
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ min: messageConfirmations.length + 1 }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          case `${safeConfigUrl}/api/v1/safe-apps/`:
            return Promise.resolve({ data: safeApps });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.NeedsConfirmation,
          logoUri: null,
          name: null,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: null,
        });
    });

    it('Get an unconfirmed message with a safe app associated', async () => {
      const chain = chainBuilder().build();
      const safeApps = range(random(3, 5)).map(() => safeAppBuilder().build());
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('safeAppId', safeApps[2].id)
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ min: messageConfirmations.length + 1 }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          case `${safeConfigUrl}/api/v1/safe-apps/`:
            return Promise.resolve({ data: safeApps });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.NeedsConfirmation,
          logoUri: safeApps[2].iconUrl,
          name: safeApps[2].name,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: null,
        });
    });

    it('should return null name and logo if the Safe App is not found', async () => {
      const chain = chainBuilder().build();
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('safeAppId', faker.datatype.number())
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ min: messageConfirmations.length + 1 }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          case `${safeConfigUrl}/api/v1/safe-apps/`:
            return Promise.resolve({ data: [] });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.NeedsConfirmation,
          logoUri: null,
          name: null,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: null,
        });
    });

    it('should return null name and logo if no safeAppId in the message', async () => {
      const chain = chainBuilder().build();
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const message = messageBuilder()
        .with('safeAppId', null)
        .with('confirmations', messageConfirmations)
        .build();
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ min: messageConfirmations.length + 1 }),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/messages/${message.messageHash}`:
            return Promise.resolve({ data: messageToJson(message) });
          case `${chain.transactionService}/api/v1/safes/${message.safe}`:
            return Promise.resolve({ data: safe });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/messages/${message.messageHash}`)
        .expect(200)
        .expect({
          messageHash: message.messageHash,
          status: MessageStatus.NeedsConfirmation,
          logoUri: null,
          name: null,
          message: message.message,
          creationTimestamp: message.created.getTime(),
          modifiedTimestamp: message.modified.getTime(),
          confirmationsSubmitted: messageConfirmations.length,
          confirmationsRequired: safe.threshold,
          proposedBy: {
            value: message.proposedBy,
            name: null,
            logoUri: null,
          },
          confirmations: messageConfirmations.map((confirmation) => ({
            owner: {
              value: confirmation.owner,
              name: null,
              logoUri: null,
            },
            signature: confirmation.signature,
          })),
          preparedSignature: null,
        });
    });
  });

  describe('Get messages by Safe address', () => {
    it('should get a message with a date label', async () => {
      const chain = chainBuilder().build();
      const messageConfirmations = range(random(2, 5)).map(() =>
        messageConfirmationBuilder().build(),
      );
      const safe = safeBuilder()
        .with(
          'threshold',
          faker.datatype.number({ min: messageConfirmations.length + 1 }),
        )
        .build();
      const message = messageBuilder()
        .with('safeAppId', null)
        .with('created', faker.date.recent())
        .with('confirmations', messageConfirmations)
        .build();
      const page = pageBuilder()
        .with('previous', null)
        .with('next', null)
        .with('count', 1)
        .with('results', [messageToJson(message)])
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/safes/${safe.address}`:
            return Promise.resolve({ data: safe });
          case `${chain.transactionService}/api/v1/safes/${safe.address}/messages/`:
            return Promise.resolve({ data: page });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            pageBuilder()
              .with('next', null)
              .with('previous', null)
              .with('count', 1)
              .with('results', [
                {
                  type: 'DATE_LABEL',
                  timestamp: new Date(
                    Date.UTC(
                      message.created.getUTCFullYear(),
                      message.created.getUTCMonth(),
                      message.created.getUTCDate(),
                    ),
                  ).getTime(),
                },
                {
                  type: 'MESSAGE',
                  messageHash: message.messageHash,
                  status: MessageStatus.NeedsConfirmation,
                  logoUri: null,
                  name: null,
                  message: message.message,
                  creationTimestamp: message.created.getTime(),
                  modifiedTimestamp: message.modified.getTime(),
                  confirmationsSubmitted: messageConfirmations.length,
                  confirmationsRequired: safe.threshold,
                  proposedBy: {
                    value: message.proposedBy,
                    name: null,
                    logoUri: null,
                  },
                  confirmations: messageConfirmations.map((confirmation) => ({
                    owner: {
                      value: confirmation.owner,
                      name: null,
                      logoUri: null,
                    },
                    signature: confirmation.signature,
                  })),
                  preparedSignature: null,
                },
              ])
              .build(),
          );
        });
    });

    it('should group messages by date', async () => {
      const chain = chainBuilder().build();
      const safe = safeBuilder().build();
      const messageCreationDate = faker.date.recent();
      const messages = range(4).map(() =>
        messageBuilder()
          .with('safeAppId', null)
          .with('created', messageCreationDate)
          .build(),
      );
      const page = pageBuilder()
        .with('previous', null)
        .with('next', null)
        .with('count', messages.length)
        .with(
          'results',
          messages.map((m) => messageToJson(m)),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/safes/${safe.address}`:
            return Promise.resolve({ data: safe });
          case `${chain.transactionService}/api/v1/safes/${safe.address}/messages/`:
            return Promise.resolve({ data: page });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            pageBuilder()
              .with('next', null)
              .with('previous', null)
              .with('count', messages.length)
              .with('results', [
                {
                  type: 'DATE_LABEL',
                  timestamp: new Date(
                    Date.UTC(
                      messageCreationDate.getUTCFullYear(),
                      messageCreationDate.getUTCMonth(),
                      messageCreationDate.getUTCDate(),
                    ),
                  ).getTime(),
                },
                ...messages.map((m) =>
                  expect.objectContaining({
                    type: 'MESSAGE',
                    messageHash: m.messageHash,
                  }),
                ),
              ])
              .build(),
          );
        });
    });

    it('should group messages by date (2)', async () => {
      const chain = chainBuilder().build();
      const safe = safeBuilder().build();
      const messages = [
        messageBuilder()
          .with('safeAppId', null)
          .with(
            'created',
            faker.date.between(
              new Date(Date.UTC(2025, 0, 1)).toISOString(),
              new Date(Date.UTC(2025, 0, 2) - 1).toISOString(),
            ),
          )
          .build(),
        messageBuilder()
          .with('safeAppId', null)
          .with(
            'created',
            faker.date.between(
              new Date(Date.UTC(2025, 0, 2)).toISOString(),
              new Date(Date.UTC(2025, 0, 3) - 1).toISOString(),
            ),
          )
          .build(),
        messageBuilder()
          .with('safeAppId', null)
          .with(
            'created',
            faker.date.between(
              new Date(Date.UTC(2025, 0, 1)).toISOString(),
              new Date(Date.UTC(2025, 0, 2) - 1).toISOString(),
            ),
          )
          .build(),
        messageBuilder()
          .with('safeAppId', null)
          .with(
            'created',
            faker.date.between(
              new Date(Date.UTC(2025, 0, 3)).toISOString(),
              new Date(Date.UTC(2025, 0, 4) - 1).toISOString(),
            ),
          )
          .build(),
      ];
      const page = pageBuilder()
        .with('previous', null)
        .with('next', null)
        .with('count', messages.length)
        .with(
          'results',
          messages.map((m) => messageToJson(m)),
        )
        .build();
      mockNetworkService.get.mockImplementation((url) => {
        switch (url) {
          case `${safeConfigUrl}/api/v1/chains/${chain.chainId}`:
            return Promise.resolve({ data: chain });
          case `${chain.transactionService}/api/v1/safes/${safe.address}`:
            return Promise.resolve({ data: safe });
          case `${chain.transactionService}/api/v1/safes/${safe.address}/messages/`:
            return Promise.resolve({ data: page });
          default:
            return Promise.reject(`No matching rule for url: ${url}`);
        }
      });

      await request(app.getHttpServer())
        .get(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            pageBuilder()
              .with('next', null)
              .with('previous', null)
              .with('count', messages.length)
              .with('results', [
                {
                  type: 'DATE_LABEL',
                  timestamp: Date.UTC(2025, 0, 1),
                },
                expect.objectContaining({
                  type: 'MESSAGE',
                  messageHash: messages[0].messageHash,
                }),
                expect.objectContaining({
                  type: 'MESSAGE',
                  messageHash: messages[2].messageHash,
                }),
                {
                  type: 'DATE_LABEL',
                  timestamp: Date.UTC(2025, 0, 2),
                },
                expect.objectContaining({
                  type: 'MESSAGE',
                  messageHash: messages[1].messageHash,
                }),
                {
                  type: 'DATE_LABEL',
                  timestamp: Date.UTC(2025, 0, 3),
                },
                expect.objectContaining({
                  type: 'MESSAGE',
                  messageHash: messages[3].messageHash,
                }),
              ])
              .build(),
          );
        });
    });
  });

  describe('Create messages', () => {
    it('Success', async () => {
      const chain = chainBuilder().build();
      const safe = safeBuilder().build();
      const message = messageBuilder().build();
      mockNetworkService.get.mockImplementation((url) =>
        url === `${safeConfigUrl}/api/v1/chains/${chain.chainId}`
          ? Promise.resolve({ data: chain })
          : Promise.reject(`No matching rule for url: ${url}`),
      );
      mockNetworkService.post.mockImplementation((url) =>
        url ===
        `${chain.transactionService}/api/v1/safes/${safe.address}/messages/`
          ? Promise.resolve({ data: messageToJson(message) })
          : Promise.reject(`No matching rule for url: ${url}`),
      );

      await request(app.getHttpServer())
        .post(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .send(createMessageDtoBuilder().build())
        .expect(200)
        .expect(JSON.stringify(messageToJson(message)));
    });

    it('should return an error from the Transaction Service', async () => {
      const chain = chainBuilder().build();
      const safe = safeBuilder().build();
      const errorMessage = faker.random.words();
      mockNetworkService.get.mockImplementation((url) =>
        url === `${safeConfigUrl}/api/v1/chains/${chain.chainId}`
          ? Promise.resolve({ data: chain })
          : Promise.reject(`No matching rule for url: ${url}`),
      );
      mockNetworkService.post.mockImplementation((url) =>
        url ===
        `${chain.transactionService}/api/v1/safes/${safe.address}/messages/`
          ? Promise.reject({
              status: 400,
              data: { message: errorMessage },
            })
          : Promise.reject(`No matching rule for url: ${url}`),
      );

      await request(app.getHttpServer())
        .post(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .send(createMessageDtoBuilder().build())
        .expect(400)
        .expect({
          message: errorMessage,
          code: 400,
        });
    });

    it('should get a validation error', async () => {
      const chain = chainBuilder().build();
      const safe = safeBuilder().build();

      await request(app.getHttpServer())
        .post(`/v1/chains/${chain.chainId}/safes/${safe.address}/messages`)
        .send(
          createMessageDtoBuilder()
            .with('message', faker.datatype.number())
            .build(),
        )
        .expect(400)
        .expect({
          message: 'Validation failed',
          code: 42,
          arguments: [],
        });
    });
  });

  describe('Update message signatures', () => {
    it('Success', async () => {
      const chain = chainBuilder().build();
      const message = messageBuilder()
        .with('safeAppId', null)
        .with('created', faker.date.recent())
        .build();
      const expectedResponse = {
        data: { signature: faker.datatype.hexadecimal() },
      };
      mockNetworkService.get.mockImplementation((url) =>
        url === `${safeConfigUrl}/api/v1/chains/${chain.chainId}`
          ? Promise.resolve({ data: chain })
          : Promise.reject(`No matching rule for url: ${url}`),
      );
      mockNetworkService.post.mockImplementation((url) =>
        url ===
        `${chain.transactionService}/api/v1/messages/${message.messageHash}/signatures/`
          ? Promise.resolve(expectedResponse)
          : Promise.reject(`No matching rule for url: ${url}`),
      );

      await request(app.getHttpServer())
        .post(
          `/v1/chains/${chain.chainId}/messages/${message.messageHash}/signatures`,
        )
        .send(updateMessageSignatureDtoBuilder().build())
        .expect(200)
        .expect(expectedResponse.data);
    });

    it('should return an error from the provider', async () => {
      const chain = chainBuilder().build();
      const message = messageBuilder()
        .with('safeAppId', null)
        .with('created', faker.date.recent())
        .build();
      const errorMessage = faker.random.words();
      mockNetworkService.get.mockImplementation((url) =>
        url === `${safeConfigUrl}/api/v1/chains/${chain.chainId}`
          ? Promise.resolve({ data: chain })
          : Promise.reject(`No matching rule for url: ${url}`),
      );
      mockNetworkService.post.mockImplementation((url) =>
        url ===
        `${chain.transactionService}/api/v1/messages/${message.messageHash}/signatures/`
          ? Promise.reject({
              status: 400,
              data: { message: errorMessage },
            })
          : Promise.reject(`No matching rule for url: ${url}`),
      );

      await request(app.getHttpServer())
        .post(
          `/v1/chains/${chain.chainId}/messages/${message.messageHash}/signatures`,
        )
        .send(updateMessageSignatureDtoBuilder().build())
        .expect(400)
        .expect({
          message: errorMessage,
          code: 400,
        });
    });

    it('should get a validation error', async () => {
      const chain = chainBuilder().build();
      const message = messageBuilder()
        .with('safeAppId', null)
        .with('created', faker.date.recent())
        .build();

      await request(app.getHttpServer())
        .post(
          `/v1/chains/${chain.chainId}/messages/${message.messageHash}/signatures`,
        )
        .send({})
        .expect(400)
        .expect({
          message: 'Validation failed',
          code: 42,
          arguments: [],
        });
    });
  });
});