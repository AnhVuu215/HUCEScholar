import { Global, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AUTH_CONFIG, AuthConfiguration, parseAuthEnvironment } from '../auth/auth.config';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfiguration) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => parseAuthEnvironment(process.env) },
    DatabaseService,
  ],
  exports: [AUTH_CONFIG, DatabaseService],
})
export class DatabaseModule {}
