import { Resolver, Query, Mutation, Field, InputType, Arg, Ctx, ObjectType } from "type-graphql";
import { MyContext } from "src/types";
import { User } from "../entities/User";
import argon2 from "argon2"
import {EntityManager} from "@mikro-orm/postgresql"
import { COOKIE_NAME } from "../constants";

@InputType() // WE USE INPUTTYPES AS ARGUMENTS ( @ARGS )
class UsernamePasswordInput {
    @Field()
    username: string

    @Field()
    password: string
}

@ObjectType()
class FieldError {
    @Field()
    field: string
    
    @Field()
    message: string
}


@ObjectType() // WE CAN RETURN OBJECT TYPES
class UserResponse {
    @Field(() => [FieldError], {nullable: true})
    errors?: FieldError[]

    @Field(() => User, {nullable: true})
    user?: User
}

@Resolver()
export class UserResolver {

    @Query(() => User, {nullable: true})
    async me(
        @Ctx() {req, em}: MyContext
    ) {
        if(!req.session.userId) {
            return null
        } 
        const user = em.findOne(User, {id: req.session.userId})
        return user
    }

    
    @Mutation(() => UserResponse)
    async register(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() {em}: MyContext
    ): Promise<UserResponse> {

        if(options.username.length <= 2) {
            return {
                errors:[{
                    field: "username",
                    message: "length must be greater then 2"
                }]
            }
        }

        if(options.password.length <= 5) {
            return {
                errors:[{
                    field: "password",
                    message: "length must be greater then 5"
                }]
            }
        }

        const hashedPassword = await argon2.hash(options.password)
        let user

        try {
            const result = await (em as EntityManager).createQueryBuilder(User).getKnexQuery().insert({
                    username: options.username,
                    password: hashedPassword,
                    created_at: new Date(),
                    updated_at: new Date() 
                })
                .returning("*")
                user = result[0]
        } catch(err) {
            if(err.code === "23505"){
                return {
                    errors: [{
                        field: "username",
                        message: "username already taken"
                    }]
                }
            }
            console.log("message: ", err.message)
        }
        return {user}
    }





    @Mutation(() => UserResponse)
    async login(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() {em, req}: MyContext
    ): Promise <UserResponse> {
        const user = await em.findOne(User, {
            username: options.username
        })
        if (!user) {
            return {
                errors: [{
                    field: "username",
                    message: "that username doesn't exist",
                 }]
            }
        }

        const valid = argon2.verify(user.password, options.password)
        if(!valid) {
            return {
                errors: [{
                    field: "password",
                    message: "incorrect password",
                 }]
            }
        }

        // WE CAN STORE ANYTHING INSIDE SESSION
        // SORU ISARETI VARE CUNKU DFEFAULT OLARAK MIGHT BE UNDEFINED
        // UNDEFINED OLMADIGI ICIN SORU ISARETİ EXPLANATION MARK
        req.session.userId = user.id


        return {user}
    }






    @Mutation(() => Boolean)
    async logout(
        @Ctx() { req, res }: MyContext
    ) {
        return new Promise((resolve) => 
        req.session.destroy((err) => {
            res.clearCookie(COOKIE_NAME)
            if(err) {
                console.log(err)
                resolve(false)
                return
            }
            resolve(true)
        })
        )
    }
}