import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { SqljsConnectionOptions } from 'typeorm/driver/sqljs/SqljsConnectionOptions';

import { populate, PopulateOptions } from '../mock-data/populate';
import { preBootstrapConfig } from '../src/bootstrap';
import { Mutable } from '../src/common/common-types';
import { VendureConfig } from '../src/config/vendure-config';

import { testConfig } from './config/test-config';

// tslint:disable:no-console
/**
 * A server against which the e2e tests should be run.
 */
export class TestServer {
    app: INestApplication;

    /**
     * Bootstraps an instance of Vendure server and populates the database according to the options
     * passed in. Should be called immediately after creating the client in the `beforeAll` function.
     *
     * The populated data is saved into an .sqlite file for each test file. On subsequent runs, this file
     * is loaded so that the populate step can be skipped, which speeds up the tests significantly.
     */
    async init(options: PopulateOptions) {
        const testingConfig = testConfig;
        const dbDataDir = '__data__';
        // tslint:disable-next-line:no-non-null-assertion
        const testFilePath = module!.parent!.filename;
        const dbFileName = path.basename(testFilePath) + '.sqlite';
        const dbFilePath = path.join(path.dirname(testFilePath), dbDataDir, dbFileName);

        (testingConfig.dbConnectionOptions as Mutable<SqljsConnectionOptions>).location = dbFilePath;
        if (!fs.existsSync(dbFilePath)) {
            console.log(`Test data not found. Populating database and saving to "${dbFilePath}"`);
            await this.populateInitialData(testingConfig, options);
        }
        console.log(`Loading test from "${dbFilePath}"`);
        this.app = await this.bootstrapForTesting(testingConfig);
    }

    /**
     * Destroy the Vendure instance. Should be called in the `afterAll` function.
     */
    async destroy() {
        await this.app.close();
    }

    /**
     * Populates an .sqlite database file based on the PopulateOptions.
     */
    private async populateInitialData(testingConfig: VendureConfig, options: PopulateOptions) {
        (testingConfig.dbConnectionOptions as Mutable<SqljsConnectionOptions>).autoSave = true;
        const populateApp = await populate(testingConfig, this.bootstrapForTesting, {
            ...options,
            logging: false,
        });
        await populateApp.close();
        (testingConfig.dbConnectionOptions as Mutable<SqljsConnectionOptions>).autoSave = false;
    }

    /**
     * Bootstraps an instance of the Vendure server for testing against.
     */
    private async bootstrapForTesting(userConfig: Partial<VendureConfig>): Promise<INestApplication> {
        const config = await preBootstrapConfig(userConfig);

        const appModule = await import('../src/app.module');
        const moduleFixture = await Test.createTestingModule({
            imports: [appModule.AppModule],
        }).compile();

        const app = moduleFixture.createNestApplication();
        await app.listen(config.port);
        return app;
    }
}