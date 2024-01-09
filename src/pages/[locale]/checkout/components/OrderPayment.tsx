import { storefrontApiMutation } from '@/src/graphql/client';
import { AvailablePaymentMethodsType } from '@/src/graphql/selectors';
import React, { InputHTMLAttributes, forwardRef, useEffect, useState } from 'react';
import { Stack } from '@/src/components/atoms';

import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, Stripe, StripeError } from '@stripe/stripe-js';
import { StripeForm } from './PaymentMethods/StripeForm';
import { useCheckout } from '@/src/state/checkout';
import { Banner, Input } from '@/src/components/forms';
import { useTranslation } from 'next-i18next';
import { Przelewy24Logo } from '@/src/assets/svg/Przelewy24Logo';
import styled from '@emotion/styled';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Button } from '@/src/components/molecules/Button';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/router';
import { usePush } from '@/src/lib/redirect';

const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_KEY;

interface OrderPaymentProps {
    availablePaymentMethods?: AvailablePaymentMethodsType[];
    stripeData?: { paymentIntent: string | null };
    language: string;
}

type FormValues = {
    payment:
        | 'przelewy24'
        | 'przelewy24-blik'
        | 'stripe'
        | 'dummy-method-success'
        | 'dummy-method-error'
        | 'dummy-method-decline';
    blikCode?: string;
};

type StandardMethodMetadata = {
    shouldDecline: boolean;
    shouldError: boolean;
    shouldErrorOnSettle: boolean;
};

export const OrderPayment: React.FC<OrderPaymentProps> = ({ availablePaymentMethods, stripeData, language }) => {
    const { t } = useTranslation('common');
    const { activeOrder } = useCheckout();
    const { push: routerPush } = useRouter();
    const push = usePush();
    //For stripe
    const [stripe, setStripe] = useState<Stripe | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        watch,
        handleSubmit,
        register,
        formState: { isSubmitting },
    } = useForm<FormValues>();

    useEffect(() => {
        const initStripe = async () => {
            if (STRIPE_PUBLIC_KEY) {
                const stripePromise = await loadStripe(STRIPE_PUBLIC_KEY);
                if (stripePromise) setStripe(stripePromise);
            }
        };
        if (stripeData?.paymentIntent) initStripe();
    }, []);

    const onStripeSubmit = (result: { error: StripeError }) => {
        if (!result.error) return;
        setError(t(`errors.stripe.${result.error.type}`));
    };

    const defaultMethod = availablePaymentMethods?.find(m => m.code === 'standard-payment');
    const przelewy24Method = availablePaymentMethods?.find(m => m.code === 'przelewy-24');

    const standardMethod = async (method: string, metadata: StandardMethodMetadata) => {
        // Add payment to order
        try {
            setError(null);
            const { addPaymentToOrder } = await storefrontApiMutation(language)({
                addPaymentToOrder: [
                    { input: { method, metadata: JSON.stringify(metadata) } },
                    {
                        __typename: true,
                        '...on Order': { state: true, code: true },
                        '...on IneligiblePaymentMethodError': {
                            message: true,
                            errorCode: true,
                            eligibilityCheckerMessage: true,
                        },
                        '...on NoActiveOrderError': {
                            message: true,
                            errorCode: true,
                        },
                        '...on OrderPaymentStateError': {
                            message: true,
                            errorCode: true,
                        },
                        '...on OrderStateTransitionError': {
                            message: true,
                            errorCode: true,
                            fromState: true,
                            toState: true,
                            transitionError: true,
                        },
                        '...on PaymentDeclinedError': {
                            errorCode: true,
                            message: true,
                            paymentErrorMessage: true,
                        },
                        '...on PaymentFailedError': {
                            errorCode: true,
                            message: true,
                            paymentErrorMessage: true,
                        },
                    },
                ],
            });
            if (addPaymentToOrder.__typename !== 'Order') {
                setError(t(`errors.backend.${addPaymentToOrder.errorCode}`));
            } else if (
                addPaymentToOrder.state === 'PaymentSettled' ||
                addPaymentToOrder.state === 'PaymentAuthorized'
            ) {
                push(`/checkout/confirmation/${addPaymentToOrder.code}`);
            }
        } catch (e) {
            setError(t(`errors.backend.UNKNOWN_ERROR`));
        }
    };

    const przelewy24 = async (blikCode?: string) => {
        try {
            setError(null);
            const { addPaymentToOrder } = await storefrontApiMutation(language)({
                addPaymentToOrder: [
                    { input: { method: 'przelewy-24', metadata: blikCode ? JSON.stringify({ blikCode }) : {} } },
                    {
                        __typename: true,
                        '...on Order': { state: true, code: true, payments: { metadata: true } },
                        '...on IneligiblePaymentMethodError': {
                            message: true,
                            errorCode: true,
                            eligibilityCheckerMessage: true,
                        },
                        '...on NoActiveOrderError': {
                            message: true,
                            errorCode: true,
                        },
                        '...on OrderPaymentStateError': {
                            message: true,
                            errorCode: true,
                        },
                        '...on OrderStateTransitionError': {
                            message: true,
                            errorCode: true,
                            fromState: true,
                            toState: true,
                            transitionError: true,
                        },
                        '...on PaymentDeclinedError': {
                            errorCode: true,
                            message: true,
                            paymentErrorMessage: true,
                        },
                        '...on PaymentFailedError': {
                            errorCode: true,
                            message: true,
                            paymentErrorMessage: true,
                        },
                    },
                ],
            });
            if (!addPaymentToOrder) {
                setError(t(`errors.backend.UNKNOWN_ERROR`));
                return;
            }
            if (addPaymentToOrder.__typename !== 'Order') {
                setError(t(`errors.backend.${addPaymentToOrder.errorCode}`));
                return;
            }
            if (!addPaymentToOrder.payments) {
                setError(t(`errors.backend.UNKNOWN_ERROR`));
                return;
            }

            if (
                blikCode &&
                addPaymentToOrder.__typename === 'Order' &&
                addPaymentToOrder.state === 'PaymentAuthorized'
            ) {
                push('/checkout/confirmation/' + addPaymentToOrder.code);
                return;
            }
            console.log(addPaymentToOrder);
            if (addPaymentToOrder.payments[0].metadata.public.paymentUrl) {
                routerPush(addPaymentToOrder.payments[0].metadata.public.paymentUrl);
                return;
            }
        } catch (e) {
            console.log(e);
        }
    };

    const onSubmit: SubmitHandler<FormValues> = async data => {
        if (data.payment === 'stripe') return;
        if (data.payment === 'przelewy24') {
            await przelewy24();
            return;
        }

        if (data.payment === 'przelewy24-blik') {
            await przelewy24(data.blikCode);
            return;
        }

        if (!defaultMethod) return;
        if (data.payment === 'dummy-method-success') {
            await standardMethod(defaultMethod.code, {
                shouldDecline: false,
                shouldError: false,
                shouldErrorOnSettle: false,
            });
            return;
        }

        if (data.payment === 'dummy-method-error') {
            await standardMethod(defaultMethod.code, {
                shouldDecline: false,
                shouldError: true,
                shouldErrorOnSettle: false,
            });
            return;
        }

        if (data.payment === 'dummy-method-decline') {
            await standardMethod(defaultMethod.code, {
                shouldDecline: true,
                shouldError: false,
                shouldErrorOnSettle: false,
            });
            return;
        }
    };
    console.log(activeOrder);

    return activeOrder ? (
        <Stack w100 column itemsCenter gap="3.5rem">
            <Banner error={{ message: error ?? undefined }} clearErrors={() => setError(null)} />
            <PaymentForm onSubmit={handleSubmit(onSubmit)}>
                {przelewy24Method && (
                    <Stack itemsCenter>
                        <PaymentButton
                            id="przelewy24"
                            value="przelewy24"
                            label="Przelewy24"
                            icon={
                                <P24Logo itemsCenter justifyCenter>
                                    <Przelewy24Logo />
                                </P24Logo>
                            }
                            checked={watch('payment') === 'przelewy24'}
                            {...register('payment')}
                        />
                    </Stack>
                )}
                {przelewy24Method && (
                    <Stack itemsCenter column gap="1.5rem">
                        <PaymentButton
                            id="przelewy24-blik"
                            value="przelewy24-blik"
                            label="Przelewy24 + BLIK"
                            icon={
                                <P24Logo itemsCenter justifyCenter>
                                    <Przelewy24Logo />
                                </P24Logo>
                            }
                            checked={watch('payment') === 'przelewy24-blik'}
                            {...register('payment')}
                        />
                        {watch('payment') === 'przelewy24-blik' ? (
                            <Input
                                {...register('blikCode', {
                                    required: true,
                                    minLength: 6,
                                    maxLength: 6,
                                    pattern: /^\d+$/,
                                    onChange: e => {
                                        if (e.target.value.length > 6)
                                            e.target.value = e.target.value.slice(0, 6).replace(/\D/g, '');
                                    },
                                })}
                                label="BLIK Code"
                            />
                        ) : (
                            <></>
                        )}
                    </Stack>
                )}
                {stripe && stripeData?.paymentIntent && (
                    <PaymentButton
                        id="stripe"
                        value="stripe"
                        label="Stripe"
                        checked={watch('payment') === 'stripe'}
                        {...register('payment')}
                    />
                )}
                {defaultMethod && (
                    <>
                        <PaymentButton
                            id="dummy-method-success"
                            value="dummy-method-success"
                            label="Dummy method - success"
                            icon={<StyledCreditCard method="success" />}
                            checked={watch('payment') === 'dummy-method-success'}
                            {...register('payment')}
                        />
                        <PaymentButton
                            id="dummy-method-error"
                            value="dummy-method-error"
                            label="Dummy method - error"
                            icon={<StyledCreditCard method="error" />}
                            checked={watch('payment') === 'dummy-method-error'}
                            {...register('payment')}
                        />
                        <PaymentButton
                            id="dummy-method-decline"
                            value="dummy-method-decline"
                            label="Dummy method - decline"
                            icon={<StyledCreditCard method="decline" />}
                            checked={watch('payment') === 'dummy-method-decline'}
                            {...register('payment')}
                        />
                    </>
                )}
                {watch('payment') !== 'stripe' && (
                    <Button loading={isSubmitting} type="submit">
                        Submit
                    </Button>
                )}
            </PaymentForm>
            {watch('payment') === 'stripe' && stripe && stripeData?.paymentIntent ? (
                <Elements stripe={stripe} options={{ clientSecret: stripeData.paymentIntent }}>
                    <StripeForm activeOrder={activeOrder} onStripeSubmit={onStripeSubmit} />
                </Elements>
            ) : null}
        </Stack>
    ) : null;
};

const StyledCreditCard = styled(CreditCard)<{ method: 'success' | 'decline' | 'error' }>`
    color: ${({ theme, method }) => (method === 'success' ? theme.success : theme.error)};
`;

const P24Logo = styled(Stack)`
    width: 10rem;
    height: 6.5rem;
`;

const AbsoluteRadio = styled.input`
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;

    cursor: pointer;
`;

const StyledP24Button = styled.button<{ active?: boolean }>`
    position: relative;
    display: flex;
    gap: 3.5rem;
    align-items: center;
    justify-content: center;
    background-color: ${p => (p.active ? '#e5e5e5' : '#fff')};
    border: 1px solid #e5e5e5;
    border-radius: 0.25rem;
    padding: 1.5rem 3rem;
    cursor: pointer;
    transition: all 0.2s ease-in-out;

    &:hover {
        background-color: #e5e5e5;
    }
`;

const PaymentForm = styled.form`
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 2rem;
`;

type InputType = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    icon?: React.ReactNode;
};

const PaymentButton = forwardRef((props: InputType, ref: React.ForwardedRef<HTMLInputElement>) => {
    const { label, icon, ...rest } = props;
    return (
        <Stack column itemsCenter gap="0.25rem">
            <StyledP24Button active={rest.checked}>
                {icon}
                <AbsoluteRadio ref={ref} {...rest} type="radio" />
                <label htmlFor={props.name}>{label}</label>
            </StyledP24Button>
        </Stack>
    );
});
